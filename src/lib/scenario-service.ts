import "server-only";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, withSession } from "@/db/client";
import { assumptionSets, scenarios, users } from "@/db/schema";
import { SCENARIO_ASSUMPTIONS, type ScenarioAssumptions } from "./assumptions";
import { can } from "./permissions";
import { appendAudit } from "./audit";
import { canonical, sha256 } from "./hash";
import { baseHash, resultHash, runScenario, type ScenarioInputs, type ScenarioResult } from "./scenario";
import { loadScenarioBase } from "./scenario-data";
import type { CurrentUser } from "./session";

export type ScenarioError = "forbidden" | "invalid" | "not_found" | "name_required";
type Res<T> = ({ ok: true } & T) | { ok: false; error: ScenarioError };
const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });

export interface SetInfo { id: string; version: string; contentHash: string; createdAt: string; author: string; note: string }
export interface AssetMeta { id: string; name: string; nameAr: string; districtId: string; type: string; occupancy: string }

async function loadSet(id: string | null): Promise<{ info: SetInfo; payload: ScenarioAssumptions } | null> {
  const db = await getDb();
  const rows = await db.select().from(assumptionSets).where(eq(assumptionSets.kind, "scenario")).orderBy(desc(assumptionSets.createdAt), desc(assumptionSets.id));
  const row = id ? rows.find((r) => r.id === id) : rows[0];
  if (!row) return null;
  return { info: { id: row.id, version: row.version, contentHash: row.contentHash, createdAt: row.createdAt.toISOString(), author: row.author, note: row.note }, payload: row.payload as ScenarioAssumptions };
}
export async function listScenarioSets(): Promise<SetInfo[]> {
  const db = await getDb();
  const rows = await db.select().from(assumptionSets).where(eq(assumptionSets.kind, "scenario")).orderBy(desc(assumptionSets.createdAt), desc(assumptionSets.id));
  return rows.map((r) => ({ id: r.id, version: r.version, contentHash: r.contentHash, createdAt: r.createdAt.toISOString(), author: r.author, note: r.note }));
}
export async function getScenarioSet(id: string | null) { return loadSet(id); }

const inputsSchema = (A: ScenarioAssumptions) => z.object({
  fx: z.number().min(A.sliders.fx[0]).max(A.sliders.fx[1]),
  rate: z.number().min(A.sliders.rate[0]).max(A.sliders.rate[1]),
  vacancy: z.number().min(A.sliders.vacancy[0]).max(A.sliders.vacancy[1]),
  rentGrowth: z.number().min(A.sliders.rentGrowth[0]).max(A.sliders.rentGrowth[1]),
});

/** Per-asset income is hidden from the investor role: the engine runs on the privileged connection and the output is filtered here. */
function forRole(result: ScenarioResult, user: CurrentUser): ScenarioResult {
  if (can(user.role, "asset.income_costs.view")) return result;
  const strip = (c: ScenarioResult["low"]) => ({ ...c, assets: c.assets.map((a) => ({ ...a, yield: null, baseYield: null })) });
  return { low: strip(result.low), central: strip(result.central), high: strip(result.high) };
}

export interface RunOutput { set: SetInfo; assumptions: ScenarioAssumptions; inputs: ScenarioInputs; result: ScenarioResult; baseHash: string; resultHash: string; assets: AssetMeta[] }

export async function runScenarioForUser(user: CurrentUser, raw: unknown, setId: string | null): Promise<Res<RunOutput>> {
  if (!can(user.role, "scenario.run")) return { ok: false, error: "forbidden" };
  const set = await loadSet(setId);
  if (!set) return { ok: false, error: "not_found" };
  const parsed = inputsSchema(set.payload).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const base = await loadScenarioBase(await getDb());
  const result = runScenario(base, parsed.data, set.payload);
  return {
    ok: true, set: set.info, assumptions: set.payload, inputs: parsed.data, result: forRole(result, user),
    baseHash: baseHash(base), resultHash: resultHash(result),
    assets: base.map((a) => ({ id: a.id, name: a.name, nameAr: a.nameAr, districtId: a.districtId, type: a.type, occupancy: a.occupancy })),
  };
}

export async function saveScenario(user: CurrentUser, p: { name: string; notes?: string; inputs: unknown; setId: string }): Promise<Res<{ id: string }>> {
  if (!can(user.role, "scenario.save")) return { ok: false, error: "forbidden" };
  const name = String(p.name ?? "").trim();
  if (name.length < 3 || name.length > 60) return { ok: false, error: "name_required" };
  const run = await runScenarioForUser(user, p.inputs, p.setId);
  if (!run.ok) return run;
  const priv = await getDb();
  const ids = (await priv.select({ id: scenarios.id }).from(scenarios)).map((x) => x.id);
  const id = `SC-${String(Math.max(0, ...ids.map((i) => Number(i.split("-")[1]) || 0)) + 1).padStart(3, "0")}`;
  const notes = String(p.notes ?? "").trim().slice(0, 300);
  await withSession(sess(user), (tx) => tx.insert(scenarios).values({
    id, name, notes, ownerId: user.id, assumptionSetId: run.set.id, inputs: run.inputs, contentHash: run.set.contentHash,
    baseHash: run.baseHash, resultHash: run.resultHash, createdAt: new Date(),
  }));
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "scenario.save", entity: "scenario", entityId: id, detail: { name, assumptionSet: run.set.id, inputs: run.inputs, resultHash: run.resultHash } });
  return { ok: true, id };
}

export interface SavedScenario { id: string; name: string; notes: string; ownerName: string; ownerNameAr: string; ownerId: string; assumptionSetId: string; contentHash: string; baseHash: string; resultHash: string; inputs: ScenarioInputs; createdAt: string }
export async function listScenarios(user: CurrentUser): Promise<SavedScenario[]> {
  return withSession(sess(user), async (tx) => {
    const rows = await tx.select().from(scenarios).orderBy(desc(scenarios.createdAt));
    const u = await tx.select().from(users);
    return rows.map((r) => ({
      id: r.id, name: r.name, notes: r.notes, ownerId: r.ownerId, ownerName: u.find((x) => x.id === r.ownerId)?.name ?? r.ownerId, ownerNameAr: u.find((x) => x.id === r.ownerId)?.nameAr ?? r.ownerId,
      assumptionSetId: r.assumptionSetId, contentHash: r.contentHash, baseHash: r.baseHash, resultHash: r.resultHash, inputs: r.inputs as ScenarioInputs, createdAt: r.createdAt.toISOString(),
    }));
  });
}

/** Re-run a saved scenario from its recorded inputs and assumption version and compare hashes. */
export async function reproduceScenario(user: CurrentUser, id: string): Promise<Res<{ identical: boolean; assumptionsIntact: boolean; baseChanged: boolean; savedResultHash: string; nowResultHash: string; setId: string; setVersion: string }>> {
  if (!can(user.role, "scenario.run")) return { ok: false, error: "forbidden" };
  const saved = (await listScenarios(user)).find((s) => s.id === id);
  if (!saved) return { ok: false, error: "not_found" };
  const set = await loadSet(saved.assumptionSetId);
  if (!set) return { ok: false, error: "not_found" };
  const base = await loadScenarioBase(await getDb());
  const res = runScenario(base, saved.inputs, set.payload);
  const now = resultHash(res);
  return {
    ok: true, identical: now === saved.resultHash, assumptionsIntact: sha256(canonical(set.payload)) === saved.contentHash, baseChanged: baseHash(base) !== saved.baseHash,
    savedResultHash: saved.resultHash, nowResultHash: now, setId: set.info.id, setVersion: set.info.version,
  };
}

const publishSchema = z.object({
  capRatePassThrough: z.number().min(0.02).max(0.5), incomeWeightLet: z.number().min(0.1).max(0.9), rentGrowthPassThrough: z.number().min(0.5).max(3),
  note: z.string().trim().min(10).max(300),
});
/** New minor version of the scenario assumptions. The previous version stays in the register and saved scenarios keep pointing at it. */
export async function publishScenarioSet(user: CurrentUser, raw: unknown): Promise<Res<{ id: string; version: string }>> {
  if (!can(user.role, "scenario.save")) return { ok: false, error: "forbidden" };
  const p = publishSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const sets = await listScenarioSets();
  const latest = await loadSet(null);
  if (!latest) return { ok: false, error: "not_found" };
  const maxMinor = Math.max(...sets.map((s) => Number(s.version.split(".")[1]) || 0));
  const version = `1.${maxMinor + 1}.0`;
  const payload: ScenarioAssumptions = JSON.parse(JSON.stringify(latest.payload));
  (payload as { version: string }).version = version;
  (payload as { capRatePassThrough: number }).capRatePassThrough = p.data.capRatePassThrough;
  (payload as { incomeWeight: Record<string, number> }).incomeWeight = { ...payload.incomeWeight, let: p.data.incomeWeightLet };
  (payload as { rentGrowthPassThrough: number }).rentGrowthPassThrough = p.data.rentGrowthPassThrough;
  const id = `AS-SCN-${version}`;
  const hash = sha256(canonical(payload));
  const priv = await getDb();
  await priv.insert(assumptionSets).values({ id, kind: "scenario", version, createdAt: new Date(), author: user.id, note: p.data.note, payload, contentHash: hash });
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "assumptions.publish", entity: "assumption_set", entityId: id, detail: { hash, from: latest.info.id, note: p.data.note } });
  return { ok: true, id, version };
}
export { SCENARIO_ASSUMPTIONS };
