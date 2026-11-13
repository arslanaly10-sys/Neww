import "server-only";
import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withSession } from "@/db/client";
import { approvals, assets, budgetLines, cashflows, distributions, leaseRenewals, leases, ledgerEntries, users } from "@/db/schema";
import { monthsWindow } from "@/db/seed";
import { appendAudit } from "./audit";
import { can } from "./permissions";
import { queueEmail } from "./outbox";
import { DEMO_TODAY, SAMPLE_FX_EGP_PER_USD } from "./assumptions";
import { budgetVsActual, CATEGORIES, forecast, isIncome, monthly, monthOf, quarterMonths, quarterOf, sum, suggestDistribution, addMonths, type Line } from "./finance-calc";
import type { CurrentUser } from "./session";
import { notify } from "./notify";

/**
 * Cash flow and finance. The ledger (the seeded income and cost lines plus hand-entered ones), the budget and the
 * forecast are for managers only, enforced by row-level security. Distributions are the investors' own payouts, so
 * investors see them too; managers propose them, a different manager approves, and a manager marks them paid.
 */
const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });

export interface LedgerRow { id: string; date: string; month: string; category: string; amountEgp: number; assetId: string | null; assetName: string | null; assetNameAr: string | null; memo: string; source: "lease" | "manual" }

/** The last complete quarter before the data date, which the next distribution is sized on. */
export const lastClosedQuarter = () => quarterOf(addMonths(`${quarterMonths(quarterOf(monthOf(DEMO_TODAY)))[0]}`, -1));

export async function getFinance(user: CurrentUser) {
  if (!can(user.role, "asset.view")) return null;
  const money = can(user.role, "asset.income_costs.view");
  const d = await withSession(sess(user), async (tx) => ({
    dist: await tx.select().from(distributions).orderBy(desc(distributions.period)),
    users: await tx.select({ id: users.id, name: users.name, nameAr: users.nameAr }).from(users),
    cash: money ? await tx.select().from(cashflows) : [],
    entries: money ? await tx.select().from(ledgerEntries) : [],
    budget: money ? await tx.select().from(budgetLines) : [],
    leases: money ? await tx.select().from(leases) : [],
    renewals: money ? await tx.select().from(leaseRenewals) : [],
    assets: money ? await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr }).from(assets) : [],
  }));
  const name = (id: string | null) => d.users.find((u) => u.id === id);
  const dist = d.dist.map((x) => ({ ...x, proposerName: name(x.proposedBy)?.name ?? x.proposedBy, proposerNameAr: name(x.proposedBy)?.nameAr ?? x.proposedBy, deciderName: name(x.decidedBy)?.name ?? null, deciderNameAr: name(x.decidedBy)?.nameAr ?? null }));
  if (!money) return { money, distributions: dist, totalPaid: dist.filter((x) => x.status === "paid").reduce((s, x) => s + x.amountEgp, 0) } as const;

  const asset = new Map(d.assets.map((a) => [a.id, a]));
  const ledger: LedgerRow[] = [
    ...d.cash.map((c) => ({ id: c.id, date: c.month, month: c.month, category: c.kind, amountEgp: c.amountEgp, assetId: c.assetId, assetName: asset.get(c.assetId)?.name ?? null, assetNameAr: asset.get(c.assetId)?.nameAr ?? null, memo: "", source: "lease" as const })),
    ...d.entries.map((e) => ({ id: e.id, date: e.entryDate, month: monthOf(e.entryDate), category: e.category, amountEgp: e.amountEgp, assetId: e.assetId, assetName: e.assetId ? asset.get(e.assetId)?.name ?? null : null, assetNameAr: e.assetId ? asset.get(e.assetId)?.nameAr ?? null : null, memo: e.memo, source: "manual" as const })),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.category.localeCompare(b.category));
  const lines: Line[] = ledger.map((l) => ({ month: l.month, category: l.category, amountEgp: l.amountEgp }));

  const months = monthsWindow().slice(-12); // the trailing twelve months with actuals
  const trailing = monthly(lines, months);
  const ytdMonths = months.filter((m) => m.startsWith(DEMO_TODAY.slice(0, 4)));
  const bva = budgetVsActual(d.budget.map((b) => ({ month: b.month, category: b.category, amountEgp: b.amountEgp })), lines, ytdMonths);

  const fx = (amount: number, cur: string) => (cur === "USD" ? Math.round(amount * SAMPLE_FX_EGP_PER_USD) : amount);
  const active = d.leases.filter((l) => l.endDate >= DEMO_TODAY);
  const fc = forecast(active.map((l) => {
    const r = d.renewals.find((x) => x.leaseId === l.id);
    return { id: l.id, monthlyRentEgp: fx(l.monthlyRent, l.currency), endDate: l.endDate, renewal: r ? { status: r.status, proposedRentEgp: r.proposedRent ? fx(r.proposedRent, l.currency) : null } : null };
  }), lines.filter((l) => months.includes(l.month) && !isIncome(l.category)), months.length, addMonths(months[months.length - 1], 1), 12);

  const q = lastClosedQuarter();
  const qNoi = sum(monthly(lines, quarterMonths(q))).noi;
  const taken = dist.some((x) => x.period === q && x.status !== "rejected");
  return {
    money, distributions: dist, totalPaid: dist.filter((x) => x.status === "paid").reduce((s, x) => s + x.amountEgp, 0),
    ledger, months, trailing, totals: sum(trailing), bva, forecast: fc, forecastTotals: sum(fc), ytdMonths,
    nextDistribution: { period: q, noi: qNoi, suggested: suggestDistribution(qNoi), canPropose: !taken },
    assets: d.assets,
  } as const;
}

export type FinanceError = "forbidden" | "invalid" | "not_found" | "too_much" | "already_proposed" | "not_approved";

const Entry = z.object({
  assetId: z.union([z.literal(""), z.string().regex(/^A-\d{3}$/)]).optional(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(CATEGORIES),
  amountEgp: z.coerce.number().int().positive().max(1e11),
  memo: z.string().trim().min(3).max(200),
});

/** Add a ledger line by hand. Costs are stored negative; the form always takes a positive amount. */
export async function addLedgerEntry(user: CurrentUser, raw: unknown): Promise<{ ok: true; id: string; auditSeq: number } | { ok: false; error: FinanceError }> {
  if (!can(user.role, "finance.manage")) return { ok: false, error: "forbidden" };
  const p = Entry.safeParse(raw);
  if (!p.success || p.data.entryDate > DEMO_TODAY || p.data.entryDate < "2025-01-01") return { ok: false, error: "invalid" };
  const v = p.data;
  const id = `LE-${randomBytes(4).toString("hex")}`;
  const amountEgp = isIncome(v.category) ? v.amountEgp : -v.amountEgp;
  await withSession(sess(user), (tx) => tx.insert(ledgerEntries).values({ id, assetId: v.assetId || null, entryDate: v.entryDate, category: v.category, amountEgp, memo: v.memo, createdBy: user.id, createdAt: new Date() }));
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "ledger.entry", entity: "ledger_entry", entityId: id, detail: { category: v.category, amountEgp, entryDate: v.entryDate, assetId: v.assetId || null, memo: v.memo } });
  return { ok: true, id, auditSeq: ev.seq };
}

const Proposal = z.object({ amountEgp: z.coerce.number().int().positive().max(1e11), note: z.string().trim().max(300).default("") });

/** Propose the distribution for the last closed quarter. It may not exceed that quarter's NOI. Routed to managers. */
export async function proposeDistribution(user: CurrentUser, raw: unknown): Promise<{ ok: true; id: string; approvalId: string; auditSeq: number } | { ok: false; error: FinanceError }> {
  if (!can(user.role, "finance.manage")) return { ok: false, error: "forbidden" };
  const p = Proposal.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const f = await getFinance(user);
  if (!f || !f.money) return { ok: false, error: "forbidden" };
  if (!f.nextDistribution.canPropose) return { ok: false, error: "already_proposed" };
  if (p.data.amountEgp > f.nextDistribution.noi) return { ok: false, error: "too_much" };
  const n = f.distributions.length + 1;
  const id = `DS-${String(n).padStart(3, "0")}`;
  const approvalId = `AP-${randomBytes(3).toString("hex").toUpperCase()}`;
  const now = new Date();
  await withSession(sess(user), async (tx) => {
    await tx.insert(distributions).values({ id, period: f.nextDistribution.period, amountEgp: p.data.amountEgp, basisNoiEgp: f.nextDistribution.noi, status: "proposed", note: p.data.note, proposedBy: user.id, createdAt: now });
    await tx.insert(approvals).values({ id: approvalId, kind: "distribution", refId: id, proposedBy: user.id, routeRole: "manager", status: "pending", note: p.data.note || null, createdAt: now });
  });
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "distribution.propose", entity: "distribution", entityId: id, detail: { period: f.nextDistribution.period, amountEgp: p.data.amountEgp, basisNoiEgp: f.nextDistribution.noi, approval: approvalId } });
  await notify({ to: { roles: ["manager"] }, kind: "approval_request", params: { id, what: "distribution" }, link: "/overview/alerts", actorId: user.id });
  return { ok: true, id, approvalId, auditSeq: ev.seq };
}

/** Record that an approved distribution has been paid, and tell the investor (through the outbox). */
export async function markDistributionPaid(user: CurrentUser, id: string): Promise<{ ok: true; auditSeq: number } | { ok: false; error: FinanceError }> {
  if (!can(user.role, "finance.manage")) return { ok: false, error: "forbidden" };
  const r = await withSession(sess(user), async (tx) => {
    const [x] = await tx.select().from(distributions).where(eq(distributions.id, String(id)));
    if (!x) return { ok: false as const, error: "not_found" as const };
    if (x.status !== "approved") return { ok: false as const, error: "not_approved" as const };
    await tx.update(distributions).set({ status: "paid", paidOn: DEMO_TODAY }).where(eq(distributions.id, x.id));
    return { ok: true as const, x };
  });
  if (!r.ok) return r;
  await queueEmail({ kind: "distribution_paid", to: "karim@sample.test", refId: r.x.id, subject: `Distribution for ${r.x.period} paid`, body: `Dear Karim,\n\nThe distribution for ${r.x.period}, EGP ${r.x.amountEgp.toLocaleString("en-US")}, was paid on ${DEMO_TODAY}.\n\nKind regards,\n${user.name}` }, user);
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "distribution.pay", entity: "distribution", entityId: r.x.id, detail: { period: r.x.period, amountEgp: r.x.amountEgp, paidOn: DEMO_TODAY } });
  await notify({ to: { roles: ["investor"] }, kind: "distribution_paid", params: { id: r.x.id, period: r.x.period, amount: r.x.amountEgp.toLocaleString("en-US") }, link: "/finance", actorId: user.id });
  return { ok: true, auditSeq: ev.seq };
}
