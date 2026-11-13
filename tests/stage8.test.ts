import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "8.8.8.8" }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { eq } from "drizzle-orm";
import { getDb, withSession } from "../src/db/client";
import { auditEvents, leaseRenewals, outbox, rentInvoices, rentPayments, tenantContacts } from "../src/db/schema";
import { aging, bucketOf, collection, daysBetween, isOverdue, statusAfter } from "../src/lib/leasing-calc";
import { getLeasing, getTenant, recordPayment, sendRentReminder, updateRenewal } from "../src/lib/leasing";
import { askHorus } from "../src/lib/horus/gateway";
import { runTool } from "../src/lib/horus/tools";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const mgr = U("u-manager-1", "manager"), inv = U("u-investor", "investor"), adm = U("u-admin", "admin");
const TODAY = "2026-11-12";

describe("leasing arithmetic", () => {
  const inv1 = { id: "a", period: "2026-08-01", dueOn: "2026-08-05", amountEgp: 1000, paidEgp: 0, status: "open" };
  const inv2 = { id: "b", period: "2026-10-01", dueOn: "2026-10-05", amountEgp: 1000, paidEgp: 400, status: "partial" };
  const inv3 = { id: "c", period: "2026-11-01", dueOn: "2026-11-05", amountEgp: 1000, paidEgp: 1000, status: "paid" };
  const inv4 = { id: "d", period: "2026-11-01", dueOn: "2026-11-20", amountEgp: 500, paidEgp: 0, status: "open" };
  it("counts days and buckets them", () => {
    expect(daysBetween("2026-08-05", TODAY)).toBe(99);
    expect([0, 30, 31, 60, 61, 90, 91].map(bucketOf)).toEqual(["d0_30", "d0_30", "d31_60", "d31_60", "d61_90", "d61_90", "d90p"]);
  });
  it("treats only past-due, unpaid amounts as overdue", () => {
    expect([inv1, inv2, inv3, inv4].map((i) => isOverdue(i, TODAY))).toEqual([true, true, false, false]);
    expect(aging([inv1, inv2, inv3, inv4], TODAY)).toEqual({ total: 1600, buckets: { d0_30: 0, d31_60: 600, d61_90: 0, d90p: 1000 } });
  });
  it("computes a month's collection rate", () => {
    expect(collection([inv3, inv4], "2026-11-01")).toEqual({ billed: 1500, collected: 1000, rate: 1000 / 1500, count: 2, paidCount: 1 });
    expect(collection([inv3], "2026-12-01").rate).toBeNull();
    expect([statusAfter(100, 0), statusAfter(100, 50), statusAfter(100, 100)]).toEqual(["open", "partial", "paid"]);
  });
});

describe("leasing data and access", () => {
  it("seeds invoices, some arrears, contacts and renewals", async () => {
    const d = (await getLeasing(mgr))!;
    expect(d.money).toBe(true);
    expect(d.rent!.aging.total).toBeGreaterThan(0);
    expect(d.tenants.filter((x) => (x.arrearsEgp ?? 0) > 0).length).toBeGreaterThanOrEqual(3);
    expect(d.rent!.month.rate).toBeGreaterThan(0.5);
    expect(d.renewals.length).toBeGreaterThan(3);
    expect(d.tenants.every((x) => x.contact?.email.endsWith(".example"))).toBe(true);
  });
  it("gives investors tenants, dates and stages but no amounts", async () => {
    const d = (await getLeasing(inv))!;
    expect(d.money).toBe(false);
    expect(d.rent).toBeNull();
    expect(d.tenants.every((x) => x.arrearsEgp === null && x.contact === null && x.leases.every((l) => l.monthlyRent === null))).toBe(true);
    expect(d.renewals.every((r) => r.renewal === null || (r.renewal.proposedRent === null && r.renewal.note === ""))).toBe(true);
    expect(d.renewals.some((r) => r.renewal?.status)).toBe(true);
  });
  it("enforces it in the database too: investors read no invoices, payments or contacts", async () => {
    const rows = await withSession({ userId: inv.id, role: "investor" }, async (tx) => [
      (await tx.select().from(rentInvoices)).length, (await tx.select().from(rentPayments)).length, (await tx.select().from(tenantContacts)).length, (await tx.select().from(leaseRenewals)).length,
    ]);
    expect(rows.slice(0, 3)).toEqual([0, 0, 0]);
    expect(rows[3]).toBeGreaterThan(0);
    expect(await getLeasing(adm)).toBeNull();
  });
});

describe("recording payments", () => {
  it("rejects bad input and overpayment, records part then full payment, and audits each", async () => {
    const d = (await getLeasing(mgr))!;
    const target = d.rent!.open.find((i) => i.daysOverdue > 0 && i.paidEgp === 0)!;
    expect(await recordPayment(inv, { invoiceId: target.id, amountEgp: 1, paidOn: TODAY, method: "cash" })).toEqual({ ok: false, error: "forbidden" });
    expect(await recordPayment(mgr, { invoiceId: target.id, amountEgp: 1, paidOn: "2027-01-01", method: "cash" })).toEqual({ ok: false, error: "invalid" });
    expect(await recordPayment(mgr, { invoiceId: target.id, amountEgp: target.outstandingEgp + 1, paidOn: TODAY, method: "cash" })).toEqual({ ok: false, error: "too_much" });
    const half = Math.floor(target.outstandingEgp / 2);
    const a = await recordPayment(mgr, { invoiceId: target.id, amountEgp: half, paidOn: TODAY, method: "transfer" });
    expect(a).toMatchObject({ ok: true, status: "partial", outstandingEgp: target.outstandingEgp - half });
    const b = await recordPayment(mgr, { invoiceId: target.id, amountEgp: target.outstandingEgp - half, paidOn: TODAY, method: "transfer" });
    expect(b).toMatchObject({ ok: true, status: "paid", outstandingEgp: 0 });
    expect(await recordPayment(mgr, { invoiceId: target.id, amountEgp: 1, paidOn: TODAY, method: "transfer" })).toEqual({ ok: false, error: "already_paid" });
    const db = await getDb();
    const ev = await db.select().from(auditEvents).where(eq(auditEvents.action, "rent.payment"));
    expect(ev.filter((e) => e.entityId === target.id)).toHaveLength(2);
    const t = await getTenant(mgr, target.tenantId);
    expect(t!.payments.filter((p) => p.invoiceId === target.id).length).toBeGreaterThanOrEqual(2);
  });
});

describe("rent reminders", () => {
  it("emails the contact through the outbox, at most once a week, only for overdue invoices", async () => {
    const d = (await getLeasing(mgr))!;
    const target = d.rent!.open.find((i) => i.daysOverdue > 0 && !i.lastReminderOn)!;
    const r = await sendRentReminder(mgr, target.id, "ar");
    expect(r.ok).toBe(true);
    const db = await getDb();
    const [m] = await db.select().from(outbox).where(eq(outbox.id, (r as { outboxId: string }).outboxId));
    expect(m.to).toMatch(/\.example$/);
    expect(m.subject).toContain("تذكير");
    expect(await sendRentReminder(mgr, target.id, "en")).toEqual({ ok: false, error: "reminded_recently" });
    expect(await sendRentReminder(inv, target.id, "en")).toEqual({ ok: false, error: "forbidden" });
    const paid = (await db.select().from(rentInvoices).where(eq(rentInvoices.status, "paid")))[0];
    expect(await sendRentReminder(mgr, paid.id, "en")).toEqual({ ok: false, error: "already_paid" });
  });
});

describe("renewals", () => {
  it("validates and saves a renewal stage, and keeps investors out", async () => {
    const d = (await getLeasing(mgr))!;
    const l = d.renewals[0];
    expect(await updateRenewal(inv, { leaseId: l.id, status: "offered", proposedRent: 1000 })).toEqual({ ok: false, error: "forbidden" });
    expect(await updateRenewal(mgr, { leaseId: l.id, status: "offered", proposedRent: "" })).toEqual({ ok: false, error: "invalid" });
    expect(await updateRenewal(mgr, { leaseId: l.id, status: "agreed", proposedRent: 50000, proposedEnd: l.endDate })).toEqual({ ok: false, error: "invalid" });
    const ok = await updateRenewal(mgr, { leaseId: l.id, status: "agreed", proposedRent: 50000, proposedEnd: "2030-01-31", note: "Signed heads of terms." });
    expect(ok).toMatchObject({ ok: true });
    const after = (await getLeasing(mgr))!.renewals.find((r) => r.id === l.id)!;
    expect(after.renewal).toMatchObject({ status: "agreed", proposedRent: 50000, proposedEnd: "2030-01-31", note: "Signed heads of terms." });
    const leaving = await updateRenewal(mgr, { leaseId: l.id, status: "leaving", proposedRent: 9, note: "" });
    expect(leaving.ok).toBe(true);
    expect((await getLeasing(mgr))!.renewals.find((r) => r.id === l.id)!.renewal).toMatchObject({ status: "leaving", proposedRent: null });
  });
});

describe("Horus and rent", () => {
  it("answers a manager's arrears question from the tool, with citations, and refuses the investor", async () => {
    const a = await askHorus(mgr, "Which tenants are behind on rent?", "en", "EGP", { apiKey: undefined, ip: "r1" });
    expect(a.blocks[0].text).toMatch(/of rent is collected/);
    expect(a.blocks[0].cites).toEqual(["calc:rent_arrears"]);
    expect(a.blocks[1].cites.every((c) => c.startsWith("lease:"))).toBe(true);
    const i = await askHorus(inv, "Which tenants are behind on rent?", "en", "EGP", { apiKey: undefined, ip: "r2" });
    expect(i.blocks[0].text).toBe("Rent collection is visible to asset managers only.");
    const ctx = { user: { id: inv.id, name: inv.name, role: inv.role }, locale: "en", currency: "EGP" as const, fx: 50 };
    expect((await runTool("rent_arrears", {}, ctx)).data).toEqual({ error: "forbidden" });
  });
});
