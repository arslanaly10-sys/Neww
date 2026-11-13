import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { getDb, withSession } from "@/db/client";
import { assets, comparableSales, dealEvents, deals, districts, users } from "@/db/schema";
import { appendAudit } from "./audit";
import { can } from "./permissions";
import { DEMO_TODAY } from "./assumptions";
import { notify } from "./notify";
import type { CurrentUser } from "./session";

/**
 * The deals pipeline: what the portfolio may buy and what it may sell. A deal moves from sourcing to won or lost.
 * Each stage carries a probability of closing, so the pipeline has a weighted value. Every deal with an area is
 * checked against the sample comparable sales of its district and type. Managers run the pipeline; investors see
 * the deals shared with them (row-level security), without the team's notes.
 */
export const STAGES = ["sourcing", "screening", "due_diligence", "offer", "negotiation", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];
export const OPEN_STAGES: Stage[] = ["sourcing", "screening", "due_diligence", "offer", "negotiation"];
/** Chance of closing at each stage: the house's planning assumption, not a prediction. */
export const PROBABILITY: Record<Stage, number> = { sourcing: 0.1, screening: 0.2, due_diligence: 0.4, offer: 0.6, negotiation: 0.75, won: 1, lost: 0 };
export const TYPES = ["apartment", "villa", "office", "retail", "land", "mixed"] as const;
export const SOURCES = ["broker", "developer", "direct", "auction"] as const;

const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });

/** Price per square metre against the median of comparable sales (same district and type, last 24 months). */
export interface MarketCheck { medianPpsqm: number; dealPpsqm: number; diff: number; n: number }
export function marketCheck(price: number, area: number | null, comps: { priceEgp: number; areaSqm: number }[]): MarketCheck | null {
  if (!area || comps.length < 3) return null;
  const x = comps.map((c) => c.priceEgp / c.areaSqm).sort((a, b) => a - b);
  const mid = x.length % 2 ? x[(x.length - 1) / 2] : (x[x.length / 2 - 1] + x[x.length / 2]) / 2;
  const deal = price / area;
  return { medianPpsqm: Math.round(mid), dealPpsqm: Math.round(deal), diff: deal / mid - 1, n: x.length };
}

const since = () => { const d = new Date(`${DEMO_TODAY}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 24); return d.toISOString().slice(0, 10); };

export async function listDeals(user: CurrentUser) {
  if (!can(user.role, "deals.view")) return null;
  const d = await withSession(sess(user), async (tx) => ({
    deals: await tx.select().from(deals).orderBy(asc(deals.stage), asc(deals.position)),
    people: await tx.select({ id: users.id, name: users.name, nameAr: users.nameAr, role: users.role }).from(users),
    districts: await tx.select({ id: districts.id, name: districts.name, nameAr: districts.nameAr }).from(districts),
    comps: await tx.select({ districtId: comparableSales.districtId, type: comparableSales.type, priceEgp: comparableSales.priceEgp, areaSqm: comparableSales.areaSqm }).from(comparableSales).where(gte(comparableSales.soldOn, since())),
    assets: await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr }).from(assets),
  }));
  const manager = user.role === "manager";
  const items = d.deals.map((x) => {
    const owner = d.people.find((p) => p.id === x.ownerId);
    const dist = d.districts.find((q) => q.id === x.districtId);
    const price = x.offerEgp ?? x.askingEgp;
    return {
      ...x, stage: x.stage as Stage, kind: x.kind as "buy" | "sell", shared: x.shared === 1,
      notes: manager ? x.notes : "", counterparty: manager ? x.counterparty : "",
      ownerName: owner?.name ?? x.ownerId, ownerNameAr: owner?.nameAr ?? x.ownerId,
      districtName: dist?.name ?? x.districtId, districtNameAr: dist?.nameAr ?? x.districtId,
      probability: PROBABILITY[x.stage as Stage], weightedEgp: Math.round(price * PROBABILITY[x.stage as Stage]),
      market: marketCheck(price, x.areaSqm, d.comps.filter((c) => c.districtId === x.districtId && c.type === x.type)),
      overdue: !!x.expectedClose && x.expectedClose < DEMO_TODAY && OPEN_STAGES.includes(x.stage as Stage),
    };
  });
  const open = items.filter((x) => OPEN_STAGES.includes(x.stage));
  const year = DEMO_TODAY.slice(0, 4);
  return {
    items,
    managers: d.people.filter((p) => p.role === "manager"),
    districts: d.districts,
    assets: d.assets,
    totals: {
      open: open.length,
      buyingEgp: open.filter((x) => x.kind === "buy").reduce((s, x) => s + (x.offerEgp ?? x.askingEgp), 0),
      sellingEgp: open.filter((x) => x.kind === "sell").reduce((s, x) => s + (x.offerEgp ?? x.askingEgp), 0),
      weightedEgp: open.reduce((s, x) => s + x.weightedEgp, 0),
      wonThisYear: items.filter((x) => x.stage === "won" && (x.closedOn ?? "").startsWith(year)).length,
      lostThisYear: items.filter((x) => x.stage === "lost" && (x.closedOn ?? "").startsWith(year)).length,
    },
    funnel: STAGES.map((s) => ({ stage: s, count: items.filter((x) => x.stage === s).length, valueEgp: items.filter((x) => x.stage === s).reduce((t, x) => t + (x.offerEgp ?? x.askingEgp), 0) })),
  };
}
export type DealView = NonNullable<Awaited<ReturnType<typeof listDeals>>>["items"][number];

export async function getDeal(user: CurrentUser, id: string) {
  const all = await listDeals(user);
  const deal = all?.items.find((x) => x.id === id);
  if (!all || !deal) return null;
  const events = await withSession(sess(user), (tx) => tx.select().from(dealEvents).where(eq(dealEvents.dealId, deal.id)).orderBy(asc(dealEvents.at)));
  const people = new Map(all.managers.map((m) => [m.id, m]));
  return { deal, events: events.map((e) => ({ ...e, actorName: people.get(e.actorId)?.name ?? e.actorId, actorNameAr: people.get(e.actorId)?.nameAr ?? e.actorId })), managers: all.managers, districts: all.districts, assets: all.assets };
}

export type DealError = "forbidden" | "invalid" | "not_found" | "closed" | "reason";

const money = z.coerce.number().int().positive().max(1e12);
const Deal = z.object({
  kind: z.enum(["buy", "sell"]),
  title: z.string().trim().min(4).max(120),
  titleAr: z.string().trim().max(120).optional().default(""),
  districtId: z.string().max(40),
  type: z.enum(TYPES),
  areaSqm: z.union([z.literal(""), z.coerce.number().int().positive().max(1e6)]).optional().default(""),
  assetId: z.union([z.literal(""), z.string().regex(/^A-\d{3}$/)]).optional().default(""),
  askingEgp: money,
  offerEgp: z.union([z.literal(""), money]).optional().default(""),
  ownerId: z.string().max(40),
  counterparty: z.string().trim().max(120).optional().default(""),
  source: z.enum(SOURCES).optional().default("broker"),
  expectedClose: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
  shared: z.union([z.boolean(), z.literal("on"), z.literal(""), z.literal("1"), z.literal("0")]).optional().transform((v) => v === true || v === "on" || v === "1"),
});

async function validRefs(user: CurrentUser, v: z.infer<typeof Deal>) {
  const all = (await listDeals(user))!;
  if (!all.managers.some((m) => m.id === v.ownerId)) return false;
  if (!all.districts.some((d) => d.id === v.districtId)) return false;
  if (v.assetId && !all.assets.some((a) => a.id === v.assetId)) return false;
  if (v.kind === "sell" && !v.assetId) return false;
  return true;
}
const ev = (dealId: string, actorId: string, kind: string, detail: Record<string, unknown> = {}, text = "") => ({ id: `DE-${randomBytes(5).toString("hex")}`, dealId, kind, text, detail, actorId, at: new Date() });

/** Add a deal to the pipeline, at the start of the sourcing column. The owner is told if it is someone else. */
export async function createDeal(user: CurrentUser, raw: unknown): Promise<{ ok: true; id: string; auditSeq: number } | { ok: false; error: DealError }> {
  if (!can(user.role, "deals.manage")) return { ok: false, error: "forbidden" };
  const p = Deal.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const v = p.data;
  if (!(await validRefs(user, v))) return { ok: false, error: "invalid" };
  const ids = await (await getDb()).select({ id: deals.id }).from(deals);
  const id = `D-${String(Math.max(0, ...ids.map((x) => Number(x.id.slice(2)) || 0)) + 1).padStart(3, "0")}`;
  const now = new Date();
  await withSession(sess(user), async (tx) => {
    await tx.insert(deals).values({
      id, kind: v.kind, title: v.title, titleAr: v.titleAr || null, districtId: v.districtId, type: v.type, areaSqm: v.areaSqm === "" ? null : v.areaSqm, assetId: v.assetId || null,
      askingEgp: v.askingEgp, offerEgp: v.offerEgp === "" ? null : v.offerEgp, stage: "sourcing", position: 0, ownerId: v.ownerId, counterparty: v.counterparty, source: v.source,
      expectedClose: v.expectedClose || null, notes: v.notes, shared: v.shared ? 1 : 0, createdBy: user.id, createdAt: now, updatedAt: now,
    });
    await tx.insert(dealEvents).values(ev(id, user.id, "created", { stage: "sourcing", askingEgp: v.askingEgp }));
  });
  const a = await appendAudit({ actorId: user.id, actorRole: user.role, action: "deal.create", entity: "deal", entityId: id, detail: { kind: v.kind, title: v.title, askingEgp: v.askingEgp, districtId: v.districtId, type: v.type } });
  await notify({ to: { users: [v.ownerId] }, kind: "deal_assigned", params: { id, title: v.title }, link: `/deals/${id}`, actorId: user.id });
  return { ok: true, id, auditSeq: a.seq };
}

/** Change a deal's details. Each change that matters (offer, owner, sharing) becomes a timeline entry. */
export async function updateDeal(user: CurrentUser, id: string, raw: unknown): Promise<{ ok: true; changed: string[]; auditSeq: number | null } | { ok: false; error: DealError }> {
  if (!can(user.role, "deals.manage")) return { ok: false, error: "forbidden" };
  const p = Deal.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const v = p.data;
  const cur = (await listDeals(user))!.items.find((x) => x.id === id);
  if (!cur) return { ok: false, error: "not_found" };
  if (!(await validRefs(user, v))) return { ok: false, error: "invalid" };
  const next = {
    kind: v.kind, title: v.title, titleAr: v.titleAr || null, districtId: v.districtId, type: v.type, areaSqm: v.areaSqm === "" ? null : v.areaSqm, assetId: v.assetId || null,
    askingEgp: v.askingEgp, offerEgp: v.offerEgp === "" ? null : v.offerEgp, ownerId: v.ownerId, counterparty: v.counterparty, source: v.source, expectedClose: v.expectedClose || null, notes: v.notes, shared: v.shared ? 1 : 0,
  };
  const before: Record<string, unknown> = { ...cur, shared: cur.shared ? 1 : 0 };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => (before[k] ?? null) !== (next[k] ?? null));
  if (!changed.length) return { ok: true, changed, auditSeq: null };
  const evs: ReturnType<typeof ev>[] = [];
  if (changed.includes("offerEgp")) evs.push(ev(cur.id, user.id, "offer", { from: cur.offerEgp, to: next.offerEgp }));
  if (changed.includes("ownerId")) evs.push(ev(cur.id, user.id, "owner", { from: cur.ownerId, to: next.ownerId }));
  if (changed.includes("shared")) evs.push(ev(cur.id, user.id, "shared", { shared: next.shared === 1 }));
  await withSession(sess(user), async (tx) => {
    await tx.update(deals).set({ ...next, updatedAt: new Date() }).where(eq(deals.id, cur.id));
    if (evs.length) await tx.insert(dealEvents).values(evs);
  });
  const a = await appendAudit({ actorId: user.id, actorRole: user.role, action: "deal.update", entity: "deal", entityId: cur.id, detail: { changed, offerEgp: next.offerEgp, ownerId: next.ownerId } });
  if (changed.includes("ownerId")) await notify({ to: { users: [next.ownerId] }, kind: "deal_assigned", params: { id: cur.id, title: next.title }, link: `/deals/${cur.id}`, actorId: user.id });
  return { ok: true, changed, auditSeq: a.seq };
}

const Move = z.object({ stage: z.enum(STAGES), position: z.coerce.number().int().min(0).max(1000).optional(), reason: z.string().trim().max(300).optional().default("") });

/**
 * Move a deal to another stage (and place in its column). Losing a deal needs a reason; won and lost deals record
 * the closing date. A closed deal can be reopened to an open stage. The owner hears about moves made by others.
 */
export async function moveDeal(user: CurrentUser, id: string, raw: unknown): Promise<{ ok: true; auditSeq: number | null } | { ok: false; error: DealError }> {
  if (!can(user.role, "deals.manage")) return { ok: false, error: "forbidden" };
  const p = Move.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const { stage, reason } = p.data;
  const all = (await listDeals(user))!;
  const cur = all.items.find((x) => x.id === id);
  if (!cur) return { ok: false, error: "not_found" };
  if (stage === "lost" && reason.length < 3) return { ok: false, error: "reason" };
  const sameStage = cur.stage === stage;
  const before = all.items.filter((x) => x.stage === stage).sort((a, b) => a.position - b.position);
  const column = before.filter((x) => x.id !== cur.id);
  const at = Math.min(p.data.position ?? column.length, column.length);
  if (sameStage && before.findIndex((x) => x.id === cur.id) === at) return { ok: true, auditSeq: null };
  column.splice(at, 0, cur);
  const closing = stage === "won" || stage === "lost";
  await withSession(sess(user), async (tx) => {
    for (let i = 0; i < column.length; i++) {
      const x = column[i];
      if (x.id === cur.id) {
        await tx.update(deals).set({ stage, position: i, updatedAt: new Date(), closedOn: closing ? DEMO_TODAY : null, lostReason: stage === "lost" ? reason : null }).where(eq(deals.id, cur.id));
      } else if (x.position !== i) {
        await tx.update(deals).set({ position: i }).where(and(eq(deals.id, x.id), eq(deals.stage, stage)));
      }
    }
    if (!sameStage) await tx.insert(dealEvents).values(ev(cur.id, user.id, closing ? "closed" : "stage", { from: cur.stage, to: stage }, stage === "lost" ? reason : ""));
  });
  if (sameStage) return { ok: true, auditSeq: null };
  const a = await appendAudit({ actorId: user.id, actorRole: user.role, action: "deal.move", entity: "deal", entityId: cur.id, detail: { from: cur.stage, to: stage, reason: stage === "lost" ? reason : undefined } });
  await notify({ to: { users: [cur.ownerId] }, kind: "deal_stage", params: { id: cur.id, title: cur.title, stage }, link: `/deals/${cur.id}`, actorId: user.id });
  return { ok: true, auditSeq: a.seq };
}

/** Add a note to a deal's timeline. Notes stay with the team: investors never see them. */
export async function addDealNote(user: CurrentUser, id: string, text: string): Promise<{ ok: true } | { ok: false; error: DealError }> {
  if (!can(user.role, "deals.manage")) return { ok: false, error: "forbidden" };
  const t = String(text ?? "").trim();
  if (t.length < 2 || t.length > 1000) return { ok: false, error: "invalid" };
  const cur = (await listDeals(user))!.items.find((x) => x.id === id);
  if (!cur) return { ok: false, error: "not_found" };
  await withSession(sess(user), (tx) => tx.insert(dealEvents).values(ev(cur.id, user.id, "note", {}, t)));
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "deal.note", entity: "deal", entityId: cur.id, detail: { length: t.length } });
  return { ok: true };
}
