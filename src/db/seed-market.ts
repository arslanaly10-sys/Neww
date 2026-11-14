import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DB } from "./client";
import * as t from "./schema";
import { SOURCES } from "@/lib/market-data/registry";
import { LIC, type Obs } from "@/lib/market-data/fetchers";

interface Snapshot { retrievedAt: string; sources: Record<string, { obs?: Obs[]; error?: string }> }

/**
 * The data-source registry, and the observations from the last real import (src/db/snapshots/market.json, written by
 * scripts/snapshot-market.ts from the live APIs). Seeding from the snapshot keeps the demo identical offline; the
 * administrator's "Import now" fetches a fresh copy. A source whose last attempt failed is seeded as failed.
 */
export async function seedMarket(db: DB) {
  await db.insert(t.dataSources).values(SOURCES.map((s) => ({ ...s, lastStatus: s.access === "api" || s.access === "file" ? "never" : null })));
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  let snap: Snapshot | null = null;
  try { snap = JSON.parse(await readFile(path.join(process.cwd(), "src/db/snapshots/market.json"), "utf8")) as Snapshot; } catch { snap = null; }
  if (!snap) return;
  const at = new Date(snap.retrievedAt);
  for (const [sourceId, s] of Object.entries(snap.sources)) {
    const id = `IR-seed-${sourceId}`;
    if (!s.obs?.length) {
      await db.insert(t.importRuns).values({ id, sourceId, startedAt: at, finishedAt: at, status: "failed", rows: 0, error: s.error ?? "no data", triggeredBy: "snapshot" });
      await db.update(t.dataSources).set({ lastStatus: "failed", lastError: s.error ?? "no data" }).where(eq(t.dataSources.id, sourceId));
      continue;
    }
    for (let i = 0; i < s.obs.length; i += 200) {
      await db.insert(t.marketObservations).values(s.obs.slice(i, i + 200).map((o) => ({ id: `MO-${randomBytes(6).toString("hex")}`, sourceId, indicator: o.indicator, label: o.label, location: o.location, locationKind: o.locationKind, period: o.period, value: String(o.value), unit: o.unit, currency: o.currency ?? null, retrievedAt: at, licence: LIC[sourceId] ?? "", transform: o.transform })));
    }
    await db.insert(t.importRuns).values({ id, sourceId, startedAt: at, finishedAt: at, status: s.error ? "partial" : "ok", rows: s.obs.length, error: s.error ?? null, triggeredBy: "snapshot" });
    await db.update(t.dataSources).set({ lastImportAt: at, lastStatus: s.error ? "partial" : "ok", lastRows: s.obs.length, lastError: s.error ?? null }).where(eq(t.dataSources.id, sourceId));
  }
}
