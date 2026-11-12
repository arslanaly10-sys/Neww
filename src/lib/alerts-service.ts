import "server-only";
import { eq } from "drizzle-orm";
import { getDb, withSession } from "@/db/client";
import { alerts, approvals, assets, comparableSales, documents, leases, marketSeries } from "@/db/schema";
import { can } from "./permissions";
import { appendAudit } from "./audit";
import { computeAlerts, visibleKind, type AlertCandidate } from "./alerts";
import { makeMarket, runValuation, type PropertyType, type Finish } from "./valuation";
import type { CurrentUser } from "./session";

const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });

export interface AlertView extends AlertCandidate { assetName: string; assetNameAr: string; status: "open" | "snoozed"; snoozeReason: string | null; snoozedBy: string | null; snoozedAt: string | null }

/** How far comparable sales sit from the asset's current value. Managers only: it is valuation work. */
async function driftByAsset(): Promise<Map<string, number>> {
  const db = await getDb();
  const [a, sales, series] = await Promise.all([db.select().from(assets), db.select().from(comparableSales), db.select().from(marketSeries)]);
  const market = makeMarket(series);
  const out = new Map<string, number>();
  for (const x of a) {
    const r = runValuation({ districtId: x.districtId, type: x.type as PropertyType, areaSqm: x.areaSqm, floor: x.floor, finish: x.finish as Finish, buildingAge: x.yearBuilt ? 2026 - x.yearBuilt : null }, sales, market);
    if (r.compsImpliedEgp) out.set(x.id, (r.compsImpliedEgp / x.valueEgp - 1) * 100);
  }
  return out;
}

export async function getAlerts(user: CurrentUser): Promise<{ open: AlertView[]; snoozed: AlertView[] }> {
  if (!can(user.role, "alerts.view") || user.role === "admin") return { open: [], snoozed: [] };
  const drift = user.role === "manager" ? await driftByAsset() : new Map<string, number>();
  const data = await withSession(sess(user), async (tx) => ({
    a: await tx.select().from(assets), l: await tx.select().from(leases), d: await tx.select().from(documents), st: await tx.select().from(alerts),
  }));
  const cands = computeAlerts({ assets: data.a, leases: data.l, docs: data.d, drift }).filter((c) => visibleKind(c.kind, user.role));
  const name = (id: string) => data.a.find((x) => x.id === id)!;
  const view = (c: AlertCandidate): AlertView => {
    const state = data.st.find((s) => s.id === c.key);
    const snoozed = state?.status === "snoozed";
    const d = (state?.detail ?? {}) as { by?: string; at?: string };
    return { ...c, assetName: name(c.assetId).name, assetNameAr: name(c.assetId).nameAr, status: snoozed ? "snoozed" : "open", snoozeReason: snoozed ? state!.snoozeReason : null, snoozedBy: snoozed ? d.by ?? null : null, snoozedAt: snoozed ? d.at ?? null : null };
  };
  const all = cands.map(view);
  return { open: all.filter((x) => x.status === "open"), snoozed: all.filter((x) => x.status === "snoozed") };
}

export type AlertError = "forbidden" | "not_found" | "reason_required";
export async function snoozeAlert(user: CurrentUser, key: string, reason: string): Promise<{ ok: true } | { ok: false; error: AlertError }> {
  if (user.role !== "manager") return { ok: false, error: "forbidden" };
  const r = String(reason ?? "").trim();
  if (r.length < 10 || r.length > 300) return { ok: false, error: "reason_required" };
  const { open } = await getAlerts(user);
  const a = open.find((x) => x.key === key);
  if (!a) return { ok: false, error: "not_found" };
  const now = new Date();
  await withSession(sess(user), async (tx) => {
    await tx.insert(alerts).values({ id: a.key, kind: a.kind, assetId: a.assetId, severity: a.severity, routeRole: a.routeRole, status: "snoozed", snoozeReason: r, detail: { ...a.detail, by: user.id, at: now.toISOString() }, raisedAt: now })
      .onConflictDoUpdate({ target: alerts.id, set: { status: "snoozed", snoozeReason: r, detail: { ...a.detail, by: user.id, at: now.toISOString() } } });
  });
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "alert.snooze", entity: "alert", entityId: key, detail: { kind: a.kind, assetId: a.assetId, severity: a.severity, reason: r } });
  return { ok: true };
}

export async function reopenAlert(user: CurrentUser, key: string): Promise<{ ok: true } | { ok: false; error: AlertError }> {
  if (user.role !== "manager") return { ok: false, error: "forbidden" };
  const { snoozed } = await getAlerts(user);
  if (!snoozed.some((x) => x.key === key)) return { ok: false, error: "not_found" };
  await withSession(sess(user), (tx) => tx.update(alerts).set({ status: "reopened" }).where(eq(alerts.id, key)));
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "alert.reopen", entity: "alert", entityId: key, detail: {} });
  return { ok: true };
}

/** What the shell badge shows: open alerts this role can see, plus approvals this user can act on. */
export async function attentionCount(user: CurrentUser): Promise<{ alerts: number; approvals: number; total: number }> {
  if (user.role === "admin") {
    const n = await withSession(sess(user), async (tx) => (await tx.select().from(approvals)).filter((x) => x.status === "pending" && x.routeRole === "admin" && x.proposedBy !== user.id).length);
    return { alerts: 0, approvals: n, total: n };
  }
  const [{ open }, n] = await Promise.all([
    getAlerts(user),
    withSession(sess(user), async (tx) => (await tx.select().from(approvals)).filter((x) => x.status === "pending" && x.routeRole === user.role && x.proposedBy !== user.id).length),
  ]);
  const a = open.length, ap = can(user.role, "approvals.decide") ? n : 0;
  return { alerts: a, approvals: ap, total: a + ap };
}
