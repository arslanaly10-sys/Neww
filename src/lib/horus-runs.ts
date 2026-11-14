import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, withSession, type DB } from "@/db/client";
import { assetFacts, assets, comparableSales, installments, intakes, leases, marketSeries, marketSources, valuationRuns } from "@/db/schema";
import { appendAudit } from "./audit";
import { can } from "./permissions";
import { DEMO_TODAY, SAMPLE_FX_EGP_PER_USD } from "./assumptions";
import { makeMarket } from "./valuation";
import { IntakeSchema, PUBLIC_TYPES, runHorus, type Intake, type RunResult, type Sale } from "./horus-engine";
import { notify } from "./notify";
import { rateLimited } from "./horus/gateway";
import { submitLead } from "./leads";
import { importedCpi } from "./market-data/service";
import type { CurrentUser } from "./session";

/**
 * HORUS valuation runs. A public questionnaire produces an illustrative run (no account, no documents). A manager or
 * analyst can run HORUS on a real asset from its record; the run waits for an analyst who did not start it to sign
 * it off or send it back. A signed-off run becomes a verified "HORUS estimate" fact on the asset record. The asset's
 * official value still changes only through a confirmed valuation.
 */
const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });

type Reader = Pick<DB, "select">;
async function evidence(db: Reader) {
  const sales = (await db.select().from(comparableSales)) as Sale[];
  const series = await db.select().from(marketSeries);
  const [src] = await db.select().from(marketSources).where(eq(marketSources.id, "ms-price-index"));
  const cpi = await importedCpi(db);
  return { sales, market: makeMarket(series), src: { market: { label: src?.title ?? "District price index (sample)", date: src?.publishedOn ?? null }, ...(cpi ? { cpi } : {}) } };
}

export type IntakeError = "invalid" | "rate_limit" | "not_found";

/** The public questionnaire. Runs HORUS and saves the answers and the illustrative result behind an unguessable id. */
export async function submitIntake(raw: unknown, locale: "en" | "ar", ip: string): Promise<{ ok: true; id: string } | { ok: false; error: IntakeError; fields?: string[] }> {
  const p = IntakeSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid", fields: [...new Set(p.error.issues.map((i) => String(i.path[0])))] };
  if (!(PUBLIC_TYPES as readonly string[]).includes(p.data.type)) return { ok: false, error: "invalid", fields: ["type"] };
  if (rateLimited(`intake|${ip}`, Date.now(), 10)) return { ok: false, error: "rate_limit" };
  const db = await getDb();
  const ev = await evidence(db);
  const result = runHorus(p.data, ev.sales, ev.market, ev.src);
  const id = `IK-${randomBytes(9).toString("base64url")}`;
  const runId = `VR-${randomBytes(5).toString("hex")}`;
  const now = new Date();
  await db.insert(valuationRuns).values({ id: runId, assetId: null, intakeId: id, inputs: p.data, result, valueEgp: result.valueEgp, lowEgp: result.lowEgp, highEgp: result.highEgp, confidence: result.confidence.score, modelVersion: result.modelVersion, assumptionsVersion: result.assumptionsVersion, status: "illustrative", createdBy: "public", createdAt: now });
  await db.insert(intakes).values({ id, answers: p.data, runId, locale, createdAt: now });
  await appendAudit({ actorId: "public", actorRole: "public", action: "horus.intake", entity: "valuation_run", entityId: runId, detail: { type: p.data.type, districtId: p.data.districtId, confidence: result.confidence.score, model: result.modelVersion } });
  return { ok: true, id };
}

/** A public result, by its intake id. Only what the visitor entered and the illustrative run. */
export async function getIntakeResult(id: string) {
  if (!/^IK-[A-Za-z0-9_-]{8,20}$/.test(String(id))) return null;
  const db = await getDb();
  const [ik] = await db.select().from(intakes).where(eq(intakes.id, String(id)));
  if (!ik?.runId) return null;
  const [run] = await db.select().from(valuationRuns).where(eq(valuationRuns.id, ik.runId));
  return run ? { intake: ik, answers: ik.answers as Intake, run: { ...run, result: run.result as RunResult } } : null;
}

const Contact = z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email().max(120), consent: z.literal(true) });

/** "Keep it in a portfolio workspace": the visitor leaves their details; it becomes a demo request linked to the intake. */
export async function saveIntakeContact(id: string, raw: unknown, locale: "en" | "ar", ip: string): Promise<{ ok: true } | { ok: false; error: IntakeError | "consent"; fields?: string[] }> {
  const r = await getIntakeResult(id);
  if (!r) return { ok: false, error: "not_found" };
  const p = Contact.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues.some((i) => i.path[0] === "consent") ? "consent" : "invalid", fields: [...new Set(p.error.issues.map((i) => String(i.path[0])))] };
  const lead = await submitLead({ name: p.data.name, email: p.data.email, company: "", message: `HORUS questionnaire ${id}: ${r.answers.type}, ${r.answers.districtId}. Illustrative range EGP ${r.run.lowEgp.toLocaleString("en-US")} to ${r.run.highEgp.toLocaleString("en-US")}.` }, locale, ip);
  if (!lead.ok) return { ok: false, error: lead.error };
  await (await getDb()).update(intakes).set({ contactName: p.data.name, contactEmail: p.data.email, leadId: lead.id }).where(eq(intakes.id, r.intake.id));
  return { ok: true };
}

/** The questionnaire answers HORUS would take from an asset record. Rent goes in only for roles that may see it. */
async function intakeForAsset(user: CurrentUser, assetId: string): Promise<Intake | null> {
  const rent = can(user.role, "asset.income_costs.view");
  return withSession(sess(user), async (tx) => {
    const [a] = await tx.select().from(assets).where(eq(assets.id, assetId));
    if (!a) return null;
    const [l] = rent ? await tx.select().from(leases).where(eq(leases.assetId, a.id)) : [];
    const plan = await tx.select().from(installments).where(and(eq(installments.assetId, a.id), isNull(installments.paidOn)));
    const monthlyRentEgp = l && l.endDate >= DEMO_TODAY ? (l.currency === "USD" ? l.monthlyRent * SAMPLE_FX_EGP_PER_USD : l.monthlyRent) : null;
    const type = a.type === "land" ? "land" : (a.type as Intake["type"]);
    return IntakeSchema.parse({
      type, districtId: a.districtId, compound: a.compound, areaSqm: type === "land" ? null : a.areaSqm, plotAreaSqm: a.plotAreaSqm ?? (type === "land" ? a.areaSqm : null),
      floor: a.floor, yearBuilt: a.yearBuilt, condition: type === "land" ? null : a.finish, status: a.status, deliveryOn: a.deliveryOn,
      occupancy: a.occupancy === "let" ? "let" : a.occupancy === "vacant" ? "vacant" : "owner", amenities: [], purpose: "review",
      monthlyRentEgp, installmentBalanceEgp: plan.length ? plan.reduce((s, p) => s + p.amountEgp, 0) : null, installmentMonthsLeft: plan.length ? plan.length * 3 : null,
    });
  });
}

export type RunError = "forbidden" | "not_found" | "own_run" | "closed" | "invalid";

/** Run HORUS on an asset. The run waits for an analyst's review. */
export async function startAssetRun(user: CurrentUser, assetId: string): Promise<{ ok: true; id: string; auditSeq: number } | { ok: false; error: RunError }> {
  if (!can(user.role, "horus.run")) return { ok: false, error: "forbidden" };
  const input = await intakeForAsset(user, String(assetId));
  if (!input) return { ok: false, error: "not_found" };
  const ev = await withSession(sess(user), (tx) => evidence(tx));
  const result = runHorus(input, ev.sales, ev.market, ev.src);
  const id = `VR-${randomBytes(5).toString("hex")}`;
  await withSession(sess(user), (tx) => tx.insert(valuationRuns).values({ id, assetId: String(assetId), intakeId: null, inputs: input, result, valueEgp: result.valueEgp, lowEgp: result.lowEgp, highEgp: result.highEgp, confidence: result.confidence.score, modelVersion: result.modelVersion, assumptionsVersion: result.assumptionsVersion, status: "in_review", createdBy: user.id, createdAt: new Date() }));
  const a = await appendAudit({ actorId: user.id, actorRole: user.role, action: "horus.run", entity: "valuation_run", entityId: id, detail: { assetId, value: result.valueEgp, low: result.lowEgp, high: result.highEgp, confidence: result.confidence.score, model: result.modelVersion, assumptions: result.assumptionsVersion } });
  await notify({ to: { roles: ["analyst"] }, kind: "run_to_review", params: { id, asset: String(assetId) }, link: `/valuation/runs/${id}`, actorId: user.id });
  return { ok: true, id, auditSeq: a.seq };
}

export async function listRuns(user: CurrentUser, assetId?: string) {
  if (!can(user.role, "asset.view")) return null;
  const rows = await withSession(sess(user), (tx) => tx.select({ r: valuationRuns, name: assets.name, nameAr: assets.nameAr }).from(valuationRuns).leftJoin(assets, eq(assets.id, valuationRuns.assetId)).where(assetId ? eq(valuationRuns.assetId, assetId) : undefined).orderBy(desc(valuationRuns.createdAt)));
  return rows.map((x) => ({ ...x.r, result: undefined, inputs: undefined, assetName: x.name, assetNameAr: x.nameAr }));
}

export async function getRun(user: CurrentUser, id: string) {
  if (!can(user.role, "asset.view")) return null;
  const [r] = await withSession(sess(user), (tx) => tx.select().from(valuationRuns).where(eq(valuationRuns.id, String(id))));
  if (!r) return null;
  const result = r.result as RunResult;
  // Rent is not for investors: their view of a run keeps the income method's value but not its rent workings.
  if (!can(user.role, "asset.income_costs.view") && user.role !== "analyst") {
    for (const m of result.methods) if (m.id === "income") m.workings = { capRatePct: m.workings.capRatePct ?? null };
  }
  return { ...r, inputs: r.inputs as Intake, result };
}

const Review = z.object({ verdict: z.enum(["signed_off", "returned"]), note: z.string().trim().max(500).optional().default("") });

/** An analyst signs a run off, or sends it back with a note. Never one they started. */
export async function reviewRun(user: CurrentUser, id: string, raw: unknown): Promise<{ ok: true; auditSeq: number } | { ok: false; error: RunError }> {
  if (!can(user.role, "horus.review")) return { ok: false, error: "forbidden" };
  const p = Review.safeParse(raw);
  if (!p.success || (p.data.verdict === "returned" && p.data.note.length < 5)) return { ok: false, error: "invalid" };
  const run = await getRun(user, id);
  if (!run || !run.assetId) return { ok: false, error: "not_found" };
  if (run.createdBy === user.id) return { ok: false, error: "own_run" };
  if (run.status !== "in_review") return { ok: false, error: "closed" };
  const now = new Date();
  await withSession(sess(user), (tx) => tx.update(valuationRuns).set({ status: p.data.verdict, reviewedBy: user.id, reviewNote: p.data.note || null, reviewedAt: now }).where(eq(valuationRuns.id, run.id)));
  if (p.data.verdict === "signed_off") {
    // The signed-off estimate joins the asset record as a verified fact, superseding the previous HORUS estimate.
    const db = await getDb();
    await db.update(assetFacts).set({ supersededAt: now }).where(and(eq(assetFacts.assetId, run.assetId), eq(assetFacts.field, "horus_estimate"), isNull(assetFacts.supersededAt)));
    await db.insert(assetFacts).values({ id: `AF-${randomBytes(5).toString("hex")}`, assetId: run.assetId, field: "horus_estimate", value: String(run.valueEgp), unit: "EGP", sourceKind: "valuation", sourceRef: run.id, sourceLabel: `HORUS run ${run.id} (${run.modelVersion})`, observedOn: DEMO_TODAY, recordedBy: run.createdBy, recordedAt: now, status: "verified", reviewedBy: user.id, reviewedAt: now, reviewNote: p.data.note || null });
  }
  const a = await appendAudit({ actorId: user.id, actorRole: user.role, action: p.data.verdict === "signed_off" ? "horus.signoff" : "horus.return", entity: "valuation_run", entityId: run.id, detail: { assetId: run.assetId, value: run.valueEgp, note: p.data.note || undefined } });
  await notify({ to: { users: [run.createdBy] }, kind: "run_reviewed", params: { id: run.id, outcome: p.data.verdict }, link: `/valuation/runs/${run.id}`, actorId: user.id });
  return { ok: true, auditSeq: a.seq };
}

/** Public questionnaires received, for managers and analysts. */
export async function listIntakes(user: CurrentUser) {
  if (!can(user.role, "horus.run")) return null;
  return withSession(sess(user), (tx) => tx.select({ i: intakes, value: valuationRuns.valueEgp, low: valuationRuns.lowEgp, high: valuationRuns.highEgp, confidence: valuationRuns.confidence }).from(intakes).leftJoin(valuationRuns, eq(valuationRuns.id, intakes.runId)).orderBy(desc(intakes.createdAt)));
}
