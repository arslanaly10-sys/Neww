import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withSession } from "@/db/client";
import { assets, leaseRenewals, leases, rentInvoices, rentPayments, tenantContacts, tenants } from "@/db/schema";
import { appendAudit } from "./audit";
import { can } from "./permissions";
import { queueEmail } from "./outbox";
import { DEMO_TODAY } from "./assumptions";
import { aging, collection, daysBetween, isOverdue, outstanding, RENEWAL_STAGES, statusAfter, type RenewalStage } from "./leasing-calc";
import type { CurrentUser } from "./session";

/**
 * Tenants, leases, renewals and rent collection. Every query runs under the user's row-level security: rent
 * invoices, payments and contacts exist only for managers; investors get tenants, lease dates and renewal stages,
 * with every amount removed here.
 */
const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });
export const RENEWAL_WINDOW_DAYS = 180;

export interface LeaseView {
  id: string; assetId: string; assetName: string; assetNameAr: string; startDate: string; endDate: string; daysLeft: number;
  monthlyRent: number | null; currency: string;
  renewal: { status: RenewalStage; proposedRent: number | null; proposedEnd: string | null; note: string; updatedAt: string } | null;
}
export interface TenantView {
  id: string; name: string; nameAr: string; sector: string;
  contact: { name: string; nameAr: string; email: string; phone: string } | null;
  leases: LeaseView[]; arrearsEgp: number | null; oldestOverdueDays: number | null;
}
export interface OpenInvoice {
  id: string; leaseId: string; tenantId: string; tenantName: string; tenantNameAr: string; assetId: string; assetName: string; assetNameAr: string;
  period: string; dueOn: string; amountEgp: number; paidEgp: number; outstandingEgp: number; daysOverdue: number; status: string; lastReminderOn: string | null;
}

export async function getLeasing(user: CurrentUser) {
  if (!can(user.role, "asset.view")) return null;
  const money = can(user.role, "asset.income_costs.view");
  const d = await withSession(sess(user), async (tx) => ({
    t: await tx.select().from(tenants).orderBy(asc(tenants.name)),
    l: await tx.select().from(leases),
    a: await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr }).from(assets),
    r: await tx.select().from(leaseRenewals),
    c: money ? await tx.select().from(tenantContacts) : [],
    i: money ? await tx.select().from(rentInvoices).orderBy(asc(rentInvoices.dueOn)) : [],
  }));
  const asset = new Map(d.a.map((x) => [x.id, x]));
  const tenant = new Map(d.t.map((x) => [x.id, x]));
  const leaseView = (l: (typeof d.l)[number]): LeaseView => {
    const r = d.r.find((x) => x.leaseId === l.id);
    return {
      id: l.id, assetId: l.assetId, assetName: asset.get(l.assetId)?.name ?? l.assetId, assetNameAr: asset.get(l.assetId)?.nameAr ?? l.assetId,
      startDate: l.startDate, endDate: l.endDate, daysLeft: daysBetween(DEMO_TODAY, l.endDate),
      monthlyRent: money ? l.monthlyRent : null, currency: l.currency,
      renewal: r ? { status: r.status as RenewalStage, proposedRent: money ? r.proposedRent : null, proposedEnd: r.proposedEnd, note: money ? r.note : "", updatedAt: r.updatedAt.toISOString() } : null,
    };
  };
  const tenantsOut: TenantView[] = d.t.map((x) => {
    const mine = d.i.filter((i) => i.tenantId === x.id);
    const overdue = mine.filter((i) => isOverdue(i, DEMO_TODAY));
    const c = d.c.find((y) => y.tenantId === x.id);
    return {
      id: x.id, name: x.name, nameAr: x.nameAr, sector: x.sector,
      contact: c ? { name: c.contactName, nameAr: c.contactNameAr, email: c.email, phone: c.phone } : null,
      leases: d.l.filter((l) => l.tenantId === x.id).map(leaseView).sort((a, b) => a.endDate.localeCompare(b.endDate)),
      arrearsEgp: money ? overdue.reduce((s, i) => s + outstanding(i), 0) : null,
      oldestOverdueDays: money && overdue.length ? daysBetween(overdue[0].dueOn, DEMO_TODAY) : null,
    };
  }).filter((x) => x.leases.length);

  const renewals = d.l.map(leaseView).filter((l) => l.daysLeft >= 0 && (l.daysLeft <= RENEWAL_WINDOW_DAYS || l.renewal)).sort((a, b) => a.daysLeft - b.daysLeft)
    .map((l) => ({ ...l, tenantId: d.l.find((x) => x.id === l.id)!.tenantId, tenantName: tenant.get(d.l.find((x) => x.id === l.id)!.tenantId)?.name ?? "", tenantNameAr: tenant.get(d.l.find((x) => x.id === l.id)!.tenantId)?.nameAr ?? "" }));

  let rent: null | { aging: ReturnType<typeof aging>; month: ReturnType<typeof collection>; prev: ReturnType<typeof collection>; open: OpenInvoice[]; period: string } = null;
  if (money) {
    const period = `${DEMO_TODAY.slice(0, 7)}-01`;
    const prevPeriod = new Date(Date.UTC(Number(DEMO_TODAY.slice(0, 4)), Number(DEMO_TODAY.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
    const open: OpenInvoice[] = d.i.filter((i) => outstanding(i) > 0).map((i) => ({
      id: i.id, leaseId: i.leaseId, tenantId: i.tenantId, tenantName: tenant.get(i.tenantId)?.name ?? "", tenantNameAr: tenant.get(i.tenantId)?.nameAr ?? "",
      assetId: i.assetId, assetName: asset.get(i.assetId)?.name ?? "", assetNameAr: asset.get(i.assetId)?.nameAr ?? "",
      period: i.period, dueOn: i.dueOn, amountEgp: i.amountEgp, paidEgp: i.paidEgp, outstandingEgp: outstanding(i),
      daysOverdue: Math.max(0, daysBetween(i.dueOn, DEMO_TODAY)), status: i.status, lastReminderOn: i.lastReminderOn,
    })).sort((a, b) => b.daysOverdue - a.daysOverdue || b.outstandingEgp - a.outstandingEgp);
    rent = { aging: aging(d.i, DEMO_TODAY), month: collection(d.i, period), prev: collection(d.i, prevPeriod), open, period };
  }
  return { tenants: tenantsOut, renewals, rent, money };
}

export async function getTenant(user: CurrentUser, id: string) {
  const all = await getLeasing(user);
  const t = all?.tenants.find((x) => x.id === id);
  if (!all || !t) return null;
  const invoices = all.money ? await withSession(sess(user), (tx) => tx.select().from(rentInvoices).where(eq(rentInvoices.tenantId, id)).orderBy(desc(rentInvoices.period))) : [];
  const payments = all.money && invoices.length ? await withSession(sess(user), (tx) => tx.select().from(rentPayments).orderBy(desc(rentPayments.paidOn))).then((p) => p.filter((x) => invoices.some((i) => i.id === x.invoiceId))) : [];
  return { tenant: t, invoices, payments };
}

// ---------- Writes (managers) ----------

export type LeasingError = "forbidden" | "invalid" | "not_found" | "too_much" | "already_paid" | "reminded_recently" | "no_contact";

const Payment = z.object({
  invoiceId: z.string().regex(/^RI-[A-Z0-9-]+$/),
  amountEgp: z.coerce.number().int().positive().max(1e10),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(["transfer", "cheque", "cash"]),
});

export async function recordPayment(user: CurrentUser, raw: unknown): Promise<{ ok: true; status: string; outstandingEgp: number; auditSeq: number } | { ok: false; error: LeasingError }> {
  if (!can(user.role, "rent.manage")) return { ok: false, error: "forbidden" };
  const p = Payment.safeParse(raw);
  if (!p.success || p.data.paidOn > DEMO_TODAY) return { ok: false, error: "invalid" };
  const v = p.data;
  const out = await withSession(sess(user), async (tx) => {
    const [i] = await tx.select().from(rentInvoices).where(eq(rentInvoices.id, v.invoiceId));
    if (!i) return { ok: false as const, error: "not_found" as const };
    const owed = outstanding(i);
    if (owed === 0) return { ok: false as const, error: "already_paid" as const };
    if (v.amountEgp > owed) return { ok: false as const, error: "too_much" as const };
    if (v.paidOn < i.period) return { ok: false as const, error: "invalid" as const };
    const paid = i.paidEgp + v.amountEgp;
    const status = statusAfter(i.amountEgp, paid);
    await tx.insert(rentPayments).values({ id: `RP-${randomBytes(4).toString("hex")}`, invoiceId: i.id, amountEgp: v.amountEgp, paidOn: v.paidOn, method: v.method, recordedBy: user.id, createdAt: new Date() });
    await tx.update(rentInvoices).set({ paidEgp: paid, status }).where(eq(rentInvoices.id, i.id));
    return { ok: true as const, status, outstandingEgp: i.amountEgp - paid, invoice: i };
  });
  if (!out.ok) return out;
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "rent.payment", entity: "rent_invoice", entityId: v.invoiceId, detail: { amountEgp: v.amountEgp, paidOn: v.paidOn, method: v.method, status: out.status, leaseId: out.invoice.leaseId } });
  return { ok: true, status: out.status, outstandingEgp: out.outstandingEgp, auditSeq: ev.seq };
}

/** Email the tenant about an overdue invoice (simulated: it goes to the outbox). At most one reminder a week. */
export async function sendRentReminder(user: CurrentUser, invoiceId: string, locale: "en" | "ar"): Promise<{ ok: true; outboxId: string; auditSeq: number } | { ok: false; error: LeasingError }> {
  if (!can(user.role, "rent.manage")) return { ok: false, error: "forbidden" };
  const r = await withSession(sess(user), async (tx) => {
    const [i] = await tx.select().from(rentInvoices).where(eq(rentInvoices.id, String(invoiceId)));
    if (!i) return { ok: false as const, error: "not_found" as const };
    if (!isOverdue(i, DEMO_TODAY)) return { ok: false as const, error: "already_paid" as const };
    if (i.lastReminderOn && daysBetween(i.lastReminderOn, DEMO_TODAY) < 7) return { ok: false as const, error: "reminded_recently" as const };
    const [c] = await tx.select().from(tenantContacts).where(eq(tenantContacts.tenantId, i.tenantId));
    if (!c) return { ok: false as const, error: "no_contact" as const };
    const [a] = await tx.select({ name: assets.name, nameAr: assets.nameAr }).from(assets).where(eq(assets.id, i.assetId));
    await tx.update(rentInvoices).set({ lastReminderOn: DEMO_TODAY }).where(eq(rentInvoices.id, i.id));
    return { ok: true as const, i, c, a };
  });
  if (!r.ok) return r;
  const owed = outstanding(r.i).toLocaleString("en-US");
  const ar = locale === "ar";
  const outboxId = await queueEmail({
    kind: "rent_reminder", to: r.c.email, refId: r.i.id,
    subject: ar ? `تذكير بإيجار ${r.i.period.slice(0, 7)}: ${r.a?.nameAr ?? r.i.assetId}` : `Rent reminder for ${r.i.period.slice(0, 7)}: ${r.a?.name ?? r.i.assetId}`,
    body: ar
      ? `السادة ${r.c.contactNameAr}،\n\nنود التذكير بأن إيجار ${r.i.period.slice(0, 7)} عن ${r.a?.nameAr ?? r.i.assetId} (العقد ${r.i.leaseId}) كان مستحقًا في ${r.i.dueOn}، والمتبقي ${owed} جنيه. نرجو السداد أو التواصل معنا إن كان قد تم.\n\nمع التحية،\n${user.nameAr}`
      : `Dear ${r.c.contactName},\n\nThis is a reminder that rent for ${r.i.period.slice(0, 7)} on ${r.a?.name ?? r.i.assetId} (lease ${r.i.leaseId}) was due on ${r.i.dueOn}, and EGP ${owed} is outstanding. Please arrange payment, or let us know if it has been made.\n\nKind regards,\n${user.name}`,
  }, user);
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "rent.reminder", entity: "rent_invoice", entityId: r.i.id, detail: { outboxId, leaseId: r.i.leaseId } });
  return { ok: true, outboxId, auditSeq: ev.seq };
}

const Renewal = z.object({
  leaseId: z.string().regex(/^L-\d{3}$/),
  status: z.enum(RENEWAL_STAGES),
  proposedRent: z.union([z.literal(""), z.coerce.number().int().positive().max(1e10)]).optional(),
  proposedEnd: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  note: z.string().trim().max(500).default(""),
});

export async function updateRenewal(user: CurrentUser, raw: unknown): Promise<{ ok: true; auditSeq: number } | { ok: false; error: LeasingError }> {
  if (!can(user.role, "rent.manage")) return { ok: false, error: "forbidden" };
  const p = Renewal.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const v = p.data;
  const rent = v.proposedRent === "" || v.proposedRent === undefined ? null : v.proposedRent;
  const end = v.proposedEnd === "" || v.proposedEnd === undefined ? null : v.proposedEnd;
  const r = await withSession(sess(user), async (tx) => {
    const [l] = await tx.select().from(leases).where(eq(leases.id, v.leaseId));
    if (!l) return { ok: false as const, error: "not_found" as const };
    if (end && end <= l.endDate) return { ok: false as const, error: "invalid" as const };
    if ((v.status === "offered" || v.status === "agreed") && !rent) return { ok: false as const, error: "invalid" as const };
    const row = { status: v.status, proposedRent: v.status === "leaving" ? null : rent, proposedEnd: v.status === "leaving" ? null : end, note: v.note, updatedBy: user.id, updatedAt: new Date() };
    await tx.insert(leaseRenewals).values({ leaseId: l.id, ...row }).onConflictDoUpdate({ target: leaseRenewals.leaseId, set: row });
    return { ok: true as const, l, row };
  });
  if (!r.ok) return r;
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "lease.renewal", entity: "lease", entityId: v.leaseId, detail: { status: v.status, proposedRent: r.row.proposedRent, proposedEnd: r.row.proposedEnd, currency: r.l.currency, note: v.note || undefined } });
  return { ok: true, auditSeq: ev.seq };
}

/** Overdue rent per lease, for alerts and Horus (managers only; empty for anyone else). */
export async function overdueByLease(user: CurrentUser): Promise<Map<string, { outstandingEgp: number; oldestDays: number }>> {
  const out = new Map<string, { outstandingEgp: number; oldestDays: number }>();
  if (!can(user.role, "rent.manage")) return out;
  const rows = await withSession(sess(user), (tx) => tx.select().from(rentInvoices).where(and(eq(rentInvoices.status, "open"))));
  const partial = await withSession(sess(user), (tx) => tx.select().from(rentInvoices).where(eq(rentInvoices.status, "partial")));
  for (const i of [...rows, ...partial]) {
    if (!isOverdue(i, DEMO_TODAY)) continue;
    const cur = out.get(i.leaseId) ?? { outstandingEgp: 0, oldestDays: 0 };
    out.set(i.leaseId, { outstandingEgp: cur.outstandingEgp + outstanding(i), oldestDays: Math.max(cur.oldestDays, daysBetween(i.dueOn, DEMO_TODAY)) });
  }
  return out;
}
