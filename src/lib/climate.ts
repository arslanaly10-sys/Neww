import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, withSession } from "@/db/client";
import { assets, capexItems, climateAssessments, documents, marketObservations, users } from "@/db/schema";
import { appendAudit } from "./audit";
import { can } from "./permissions";
import { DEMO_TODAY } from "./assumptions";
import { notify } from "./notify";
import { BAND, CLIMATE_VERSION, DISTRICT_SITE, HAZARDS, overall, screen, type ClimateObs, type HazardResult } from "./climate-rules";
import type { CurrentUser } from "./session";

/**
 * Climate and physical exposure: screening per asset from observed climate (NASA POWER), sample site attributes and
 * the asset record; adaptation from capital works; site-specific assessments override the screen. Investors,
 * managers and analysts read; managers and analysts record assessments.
 */
const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });
export type ClimateError = "forbidden" | "invalid" | "not_found";
const IND = ["temp_max", "temp_avg", "rain_wettest", "wind", "elevation", "solar"] as const;

async function load(user: CurrentUser, assetId?: string) {
  // Which adaptation works exist is not cost data, so every reader sees the same residual levels: read it privileged,
  // outside the session's transaction, and keep only category, status and title.
  const capex = await (await getDb()).select({ id: capexItems.id, assetId: capexItems.assetId, category: capexItems.category, status: capexItems.status, title: capexItems.title, titleAr: capexItems.titleAr }).from(capexItems);
  return withSession(sess(user), async (tx) => {
    const a = await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr, type: assets.type, districtId: assets.districtId, floor: assets.floor, yearBuilt: assets.yearBuilt, status: assets.status, valueEgp: assets.valueEgp }).from(assets).where(assetId ? eq(assets.id, assetId) : undefined).orderBy(asc(assets.id));
    const obs = await tx.select().from(marketObservations).where(and(eq(marketObservations.sourceId, "nasa_power"), inArray(marketObservations.indicator, [...IND])));
    const ov = await tx.select().from(climateAssessments).where(assetId ? and(eq(climateAssessments.assetId, assetId), isNull(climateAssessments.supersededAt)) : isNull(climateAssessments.supersededAt));
    const hist = assetId ? await tx.select().from(climateAssessments).where(eq(climateAssessments.assetId, assetId)).orderBy(asc(climateAssessments.recordedAt)) : [];
    const u = await tx.select({ id: users.id, name: users.name, nameAr: users.nameAr }).from(users);
    const docs = assetId ? await tx.select({ id: documents.id, title: documents.title }).from(documents).where(eq(documents.assetId, assetId)) : [];
    return { a, obs, capex, ov, hist, u, docs };
  });
}

function compute(d: Awaited<ReturnType<typeof load>>) {
  const v = (loc: string, ind: string) => { const o = d.obs.find((x) => x.location === loc && x.indicator === ind); return o ? Number(o.value) : null; };
  return d.a.map((a) => {
    const site = DISTRICT_SITE[a.districtId] ?? DISTRICT_SITE["new-cairo"];
    const obs: ClimateObs = { tempMax: v(a.districtId, "temp_max"), tempAvg: v(a.districtId, "temp_avg"), rainWettest: v(a.districtId, "rain_wettest"), wind: v(a.districtId, "wind"), elevation: v(a.districtId, "elevation"), solar: v(a.districtId, "solar") };
    const works = d.capex.filter((c) => c.assetId === a.id);
    const overrides = d.ov.filter((o) => o.assetId === a.id).map((o) => ({ id: o.id, hazard: o.hazard, level: o.level, method: o.method, note: o.note, assessedOn: o.assessedOn }));
    const results = screen(a, site, obs, works, overrides);
    return { asset: a, site, obs, results, overall: overall(results), works };
  });
}

const sourceMeta = (d: Awaited<ReturnType<typeof load>>) => { const o = d.obs[0]; return o ? { retrievedAt: o.retrievedAt.toISOString(), licence: o.licence, period: o.period } : null; };

/** Every asset's exposure, and the share of portfolio value at each level per hazard. */
export async function climatePortfolio(user: CurrentUser) {
  if (!can(user.role, "asset.view")) return null;
  const d = await load(user);
  const rows = compute(d);
  const total = rows.reduce((s, r) => s + r.asset.valueEgp, 0) || 1;
  const byHazard = HAZARDS.map((h) => {
    const share = { high: 0, medium: 0, low: 0 };
    for (const r of rows) share[BAND(r.results.find((x) => x.hazard === h)!.residual)] += r.asset.valueEgp / total;
    return { hazard: h, high: share.high, medium: share.medium, low: share.low, assets: rows.filter((r) => r.results.find((x) => x.hazard === h)!.residual >= 4).length };
  });
  return { rows, byHazard, version: CLIMATE_VERSION, source: sourceMeta(d), overrides: d.ov.length, adapted: rows.filter((r) => r.results.some((x) => x.mitigations.some((m) => m.status === "done"))).length };
}

export async function assetClimate(user: CurrentUser, assetId: string) {
  if (!can(user.role, "asset.view")) return null;
  const d = await load(user, String(assetId));
  const row = compute(d)[0];
  if (!row) return null;
  const u = new Map(d.u.map((x) => [x.id, x]));
  return { ...row, version: CLIMATE_VERSION, source: sourceMeta(d), documents: d.docs, history: d.hist.map((h) => ({ ...h, recorderName: u.get(h.recordedBy)?.name ?? h.recordedBy, recorderNameAr: u.get(h.recordedBy)?.nameAr ?? h.recordedBy })).reverse() };
}

export const METHODS = ["site_survey", "engineer_report", "insurer_survey", "desk_review"] as const;
const Assess = z.object({ assetId: z.string().regex(/^A-\d{3}$/), hazard: z.enum(HAZARDS), level: z.coerce.number().int().min(1).max(5), method: z.enum(METHODS), note: z.string().trim().min(10).max(600), assessedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), documentId: z.union([z.literal(""), z.string().max(20)]).optional().default("") });

/** Record a site-specific assessment. It replaces the screening level for that hazard; the previous one is kept. */
export async function recordAssessment(user: CurrentUser, raw: unknown): Promise<{ ok: true; id: string; result: HazardResult } | { ok: false; error: ClimateError }> {
  if (!can(user.role, "records.edit") && !can(user.role, "records.verify")) return { ok: false, error: "forbidden" };
  const p = Assess.safeParse(raw);
  if (!p.success || p.data.assessedOn > DEMO_TODAY) return { ok: false, error: "invalid" };
  const v = p.data;
  const r = await withSession(sess(user), async (tx) => {
    const [a] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.id, v.assetId));
    if (!a) return { error: "not_found" as const };
    if (v.documentId) { const [doc] = await tx.select({ id: documents.id }).from(documents).where(and(eq(documents.id, v.documentId), eq(documents.assetId, v.assetId))); if (!doc) return { error: "invalid" as const }; }
    const all = await tx.select({ id: climateAssessments.id }).from(climateAssessments);
    const id = `CA-${String(Math.max(0, ...all.map((x) => Number(x.id.slice(3)))) + 1).padStart(3, "0")}`;
    const now = new Date();
    await tx.update(climateAssessments).set({ supersededAt: now }).where(and(eq(climateAssessments.assetId, v.assetId), eq(climateAssessments.hazard, v.hazard), isNull(climateAssessments.supersededAt)));
    await tx.insert(climateAssessments).values({ id, assetId: v.assetId, hazard: v.hazard, level: v.level, method: v.method, note: v.note, assessedOn: v.assessedOn, documentId: v.documentId || null, recordedBy: user.id, recordedAt: now });
    return { id };
  });
  if ("error" in r) return { ok: false, error: r.error! };
  const after = (await assetClimate(user, v.assetId))!;
  const result = after.results.find((x) => x.hazard === v.hazard)!;
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "climate.assess", entity: "climate_assessment", entityId: r.id, detail: { assetId: v.assetId, hazard: v.hazard, level: v.level, screening: result.screening, method: v.method } });
  if (result.residual >= 4) await notify({ to: { roles: ["manager"] }, kind: "climate_high", params: { asset: v.assetId, hazard: v.hazard, level: result.residual }, link: `/asset/${v.assetId}/record#climate`, actorId: user.id });
  return { ok: true, id: r.id, result };
}

/** The current level for one hazard at one asset, and the date of the site assessment behind it (if any). */
export async function assessmentLevel(user: CurrentUser, assetId: string, hazard: string) {
  const c = await assetClimate(user, assetId);
  const r = c?.results.find((x) => x.hazard === hazard);
  return r ? { level: r.level, assessedOn: r.override?.assessedOn ?? null } : null;
}
