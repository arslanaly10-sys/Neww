/**
 * Fetches a fresh copy of the API sources (World Bank, WorldPop, NASA POWER, OpenStreetMap) and writes it to
 * src/db/snapshots/market.json, which the seed loads. Run: npx tsx scripts/snapshot-market.ts
 * A source that fails is written with its error, never with made-up values. Pass source ids to refresh only those
 * (the others keep their previous copy): npx tsx scripts/snapshot-market.ts worldbank
 */
import { readFile, writeFile } from "node:fs/promises";
import { getDb } from "../src/db/client";
import * as t from "../src/db/schema";
import { fetchNasaPower, fetchOsm, fetchWorldBank, fetchWorldPop, type Obs } from "../src/lib/market-data/fetchers";

(async () => {
  const db = await getDb();
  const a = (await db.select({ id: t.assets.id, lat: t.assets.lat, lng: t.assets.lng }).from(t.assets)).map((x) => ({ id: x.id, lat: Number(x.lat), lng: Number(x.lng) }));
  const d = (await db.select({ id: t.districts.id, lat: t.districts.lat, lng: t.districts.lng }).from(t.districts)).map((x) => ({ id: x.id, lat: Number(x.lat), lng: Number(x.lng) }));
  const only = process.argv.slice(2);
  let prev: { retrievedAt: string; sources: Record<string, { obs?: Obs[]; error?: string }> } | null = null;
  try { prev = JSON.parse(await readFile("src/db/snapshots/market.json", "utf8")); } catch { prev = null; }
  const out: Record<string, { obs?: Obs[]; error?: string }> = only.length && prev ? { ...prev.sources } : {};
  const jobs: [string, () => Promise<Obs[]>][] = [["worldbank", fetchWorldBank], ["worldpop", () => fetchWorldPop(a)], ["nasa_power", () => fetchNasaPower(d)], ["osm", async () => { await fetchOsm(a.slice(0, 1)); return fetchOsm(a); }]];
  for (const [id, job] of jobs.filter(([id]) => !only.length || only.includes(id))) {
    try { const obs = await job(); out[id] = { obs: [...obs], ...((obs as { failed?: string[] }).failed ? { error: `Not answered this time: ${(obs as { failed?: string[] }).failed!.join(", ")}` } : {}) }; console.log(id, "ok", obs.length, out[id].error ?? ""); } catch (e) { out[id] = { error: (e as Error).message }; console.log(id, "failed", (e as Error).message); }
  }
  await writeFile("src/db/snapshots/market.json", JSON.stringify({ retrievedAt: new Date().toISOString(), sources: out }, null, 1) + "\n");
  process.exit(0);
})();
