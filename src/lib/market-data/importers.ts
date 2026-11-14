import "server-only";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { assets, dataSources, districts, importRuns, marketObservations } from "@/db/schema";
import { appendAudit } from "../audit";
import { can } from "../permissions";
import type { CurrentUser } from "../session";
import { fetchNasaPower, fetchOsm, fetchWorldBank, fetchWorldPop, LIC, type Obs } from "./fetchers";

/**
 * Importers: run a fetcher and upsert its observations with their provenance. A failure keeps the previous copy and
 * is logged; nothing is invented to fill a gap.
 */
/** Write observations and the import log, and update the source's status. Runs on the privileged connection. */
export async function recordImport(sourceId: string, obs: Obs[] | Error, triggeredBy: string, retrievedAt = new Date()) {
  const db = await getDb();
  const started = new Date();
  const runId = `IR-${randomBytes(5).toString("hex")}`;
  if (obs instanceof Error) {
    await db.insert(importRuns).values({ id: runId, sourceId, startedAt: started, finishedAt: new Date(), status: "failed", rows: 0, error: obs.message.slice(0, 300), triggeredBy });
    await db.update(dataSources).set({ lastStatus: "failed", lastError: obs.message.slice(0, 300) }).where(eq(dataSources.id, sourceId));
    return { ok: false as const, error: obs.message };
  }
  for (let i = 0; i < obs.length; i += 200) {
    await db.insert(marketObservations).values(obs.slice(i, i + 200).map((o) => ({ id: `MO-${randomBytes(6).toString("hex")}`, sourceId, indicator: o.indicator, label: o.label, location: o.location, locationKind: o.locationKind, period: o.period, value: String(o.value), unit: o.unit, currency: o.currency ?? null, retrievedAt, licence: LIC[sourceId] ?? "", transform: o.transform })))
      .onConflictDoUpdate({ target: [marketObservations.sourceId, marketObservations.indicator, marketObservations.location, marketObservations.period], set: { value: sql`excluded.value`, retrievedAt: sql`excluded.retrieved_at`, transform: sql`excluded.transform`, label: sql`excluded.label` } });
  }
  const failed = (obs as Obs[] & { failed?: string[] }).failed;
  const note = failed?.length ? `Not answered this time: ${failed.join(", ")}` : null;
  await db.insert(importRuns).values({ id: runId, sourceId, startedAt: started, finishedAt: new Date(), status: failed?.length ? "partial" : "ok", rows: obs.length, error: note, triggeredBy });
  await db.update(dataSources).set({ lastImportAt: retrievedAt, lastStatus: failed?.length ? "partial" : "ok", lastRows: obs.length, lastError: note }).where(eq(dataSources.id, sourceId));
  return { ok: true as const, rows: obs.length };
}

async function points() {
  const db = await getDb();
  const a = await db.select({ id: assets.id, lat: assets.lat, lng: assets.lng }).from(assets);
  const d = await db.select({ id: districts.id, lat: districts.lat, lng: districts.lng }).from(districts);
  return { assets: a.map((x) => ({ id: x.id, lat: Number(x.lat), lng: Number(x.lng) })), districts: d.map((x) => ({ id: x.id, lat: Number(x.lat), lng: Number(x.lng) })) };
}

export const API_SOURCES = ["worldbank", "worldpop", "nasa_power", "osm"] as const;
export async function runImporter(sourceId: string, triggeredBy: string) {
  const p = await points();
  const job: Record<string, () => Promise<Obs[]>> = { worldbank: fetchWorldBank, worldpop: () => fetchWorldPop(p.assets), nasa_power: () => fetchNasaPower(p.districts), osm: () => fetchOsm(p.assets) };
  if (!job[sourceId]) return { ok: false as const, error: "not an API source" };
  let obs: Obs[] | Error;
  try { obs = await job[sourceId](); } catch (e) { obs = e as Error; }
  return recordImport(sourceId, obs, triggeredBy);
}

/** The administrator runs an import now. */
export async function importNow(user: CurrentUser, sourceId: string) {
  if (!can(user.role, "sources.manage")) return { ok: false as const, error: "forbidden" };
  if (!(API_SOURCES as readonly string[]).includes(sourceId)) return { ok: false as const, error: "invalid" };
  const r = await runImporter(sourceId, user.id);
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "data.import", entity: "data_source", entityId: sourceId, detail: r.ok ? { rows: r.rows } : { error: r.error } });
  return r;
}

const FileRows = z.object({ sourceId: z.enum(["capmas_cpi", "cbe_fx"]), published: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), text: z.string().max(20000) });

/**
 * A published file, pasted by the administrator as "period,value" lines (for example 2026-09,284.3). Each line is
 * checked; the publication date and who entered it go into the transformation note.
 */
export async function importFile(user: CurrentUser, raw: unknown) {
  if (!can(user.role, "sources.manage")) return { ok: false as const, error: "forbidden" };
  const p = FileRows.safeParse(raw);
  if (!p.success) return { ok: false as const, error: "invalid" };
  const lines = p.data.text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^period/i.test(l));
  const rows: Obs[] = [];
  for (const l of lines) {
    const m = l.match(/^(\d{4}(?:-\d{2}){0,2})\s*[,;\t]\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return { ok: false as const, error: "invalid", line: l };
    const cpi = p.data.sourceId === "capmas_cpi";
    rows.push({ indicator: cpi ? "cpi_urban" : "usd_egp", label: cpi ? "Urban consumer price index" : "Official EGP per USD", location: "EGY", locationKind: "country", period: m[1], value: Number(m[2]), unit: cpi ? "index" : "EGP per USD", currency: cpi ? null : "EGP",
      transform: `Entered from the file published on ${p.data.published} by ${user.name}; values as published.` });
  }
  if (!rows.length) return { ok: false as const, error: "invalid" };
  const r = await recordImport(p.data.sourceId, rows, user.id);
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "data.import", entity: "data_source", entityId: p.data.sourceId, detail: { rows: rows.length, published: p.data.published } });
  return r;
}
