import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "9.1.1.1" }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { eq } from "drizzle-orm";
import { getDb, withSession } from "../src/db/client";
import { auditEvents, budgetLines, distributions, ledgerEntries, outbox } from "../src/db/schema";
import { budgetVsActual, forecast, monthly, quarterMonths, quarterOf, suggestDistribution, sum } from "../src/lib/finance-calc";
import { addLedgerEntry, getFinance, lastClosedQuarter, markDistributionPaid, proposeDistribution } from "../src/lib/finance";
import { decideApproval, listApprovals } from "../src/lib/approvals-service";
import { askHorus } from "../src/lib/horus/gateway";
import { classify } from "../src/lib/horus/scripted";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const mgr = U("u-manager-1", "manager"), mgr2 = U("u-manager-2", "manager"), inv = U("u-investor", "investor"), adm = U("u-admin", "admin");

describe("finance arithmetic", () => {
  const lines = [
    { month: "2026-07-01", category: "rent", amountEgp: 1000 }, { month: "2026-07-01", category: "maintenance", amountEgp: -200 },
    { month: "2026-08-01", category: "rent", amountEgp: 1000 }, { month: "2026-09-01", category: "rent", amountEgp: 900 }, { month: "2026-09-01", category: "tax", amountEgp: -300 },
  ];
  it("totals months and quarters", () => {
    expect(quarterOf("2026-08-01")).toBe("2026-Q3");
    expect(quarterMonths("2026-Q3")).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
    const m = monthly(lines, quarterMonths("2026-Q3"));
    expect(m.map((x) => x.noi)).toEqual([800, 1000, 600]);
    expect(sum(m)).toEqual({ income: 2900, costs: -500, noi: 2400 });
  });
  it("compares to budget with the right sign for income and costs", () => {
    const budget = [{ month: "2026-07-01", category: "rent", amountEgp: 1100 }, { month: "2026-07-01", category: "maintenance", amountEgp: -100 }];
    const v = budgetVsActual(budget, lines, ["2026-07-01"]);
    expect(v.find((x) => x.category === "rent")).toMatchObject({ budget: 1100, actual: 1000, variance: -100, unfavourable: true });
    expect(v.find((x) => x.category === "maintenance")).toMatchObject({ budget: -100, actual: -200, variance: -100, pct: -1, unfavourable: true });
  });
  it("forecasts rent through lease ends and renewals, and averages costs", () => {
    const leases = [
      { id: "L-1", monthlyRentEgp: 100, endDate: "2026-12-31", renewal: { status: "leaving", proposedRentEgp: null } },
      { id: "L-2", monthlyRentEgp: 100, endDate: "2026-12-31", renewal: { status: "agreed", proposedRentEgp: 120 } },
      { id: "L-3", monthlyRentEgp: 100, endDate: "2026-12-31", renewal: null },
    ];
    const f = forecast(leases, [{ month: "2026-10-01", category: "tax", amountEgp: -60 }, { month: "2026-09-01", category: "maintenance", amountEgp: -60 }], 12, "2026-12-01", 3);
    expect(f.map((x) => x.income)).toEqual([300, 220, 220]);
    expect(f[0].costs).toBe(-10);
    expect(f[0].leasesEnding).toEqual(["L-1", "L-2", "L-3"]);
  });
  it("suggests 80% of NOI after a 5% reserve, rounded down, and nothing on a loss", () => {
    expect(suggestDistribution(1_000_000)).toBe(760_000);
    expect(suggestDistribution(-5)).toBe(0);
  });
});

describe("finance data and roles", () => {
  it("builds the manager's picture from the seeded ledger and budget", async () => {
    const f = await getFinance(mgr);
    if (!f || !f.money) throw new Error("manager should see money");
    expect(f.months).toHaveLength(12);
    expect(f.totals.noi).toBeGreaterThan(0);
    expect(f.forecast).toHaveLength(12);
    expect(f.bva.find((v) => v.category === "maintenance")?.unfavourable).toBe(true);
    expect(f.distributions.filter((d) => d.status === "paid")).toHaveLength(2);
    expect(lastClosedQuarter()).toBe("2026-Q3");
    expect(f.nextDistribution).toMatchObject({ period: "2026-Q3", canPropose: true });
  });
  it("gives investors their distributions only, and the database agrees", async () => {
    const f = await getFinance(inv);
    expect(f?.money).toBe(false);
    expect(f && "ledger" in f).toBe(false);
    expect(f!.distributions).toHaveLength(2);
    const rows = await withSession({ userId: inv.id, role: "investor" }, async (tx) => [(await tx.select().from(ledgerEntries)).length, (await tx.select().from(budgetLines)).length, (await tx.select().from(distributions)).length]);
    expect(rows).toEqual([0, 0, 2]);
    expect(await getFinance(adm)).toBeNull();
  });
});

describe("ledger entries", () => {
  it("stores costs negative and income positive, audits them, and rejects bad input", async () => {
    expect(await addLedgerEntry(inv, { category: "maintenance", amountEgp: 100, entryDate: "2026-11-01", memo: "x".repeat(5) })).toEqual({ ok: false, error: "forbidden" });
    expect(await addLedgerEntry(mgr, { category: "maintenance", amountEgp: 100, entryDate: "2027-01-01", memo: "Future" })).toEqual({ ok: false, error: "invalid" });
    expect(await addLedgerEntry(mgr, { category: "made_up", amountEgp: 100, entryDate: "2026-11-01", memo: "Bad" })).toEqual({ ok: false, error: "invalid" });
    const cost = await addLedgerEntry(mgr, { category: "maintenance", amountEgp: 5000, entryDate: "2026-11-03", memo: "Pump repair", assetId: "A-002" });
    const inc = await addLedgerEntry(mgr, { category: "other_income", amountEgp: 700, entryDate: "2026-11-04", memo: "Signage fee" });
    expect(cost.ok && inc.ok).toBe(true);
    const db = await getDb();
    const [c] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, (cost as { id: string }).id));
    const [i] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, (inc as { id: string }).id));
    expect([c.amountEgp, c.assetId, i.amountEgp, i.assetId]).toEqual([-5000, "A-002", 700, null]);
    expect((await db.select().from(auditEvents).where(eq(auditEvents.action, "ledger.entry"))).length).toBeGreaterThanOrEqual(2);
  });
});

describe("distributions", () => {
  it("is proposed by one manager, approved by another, then paid and the investor told", async () => {
    const f = await getFinance(mgr);
    if (!f || !f.money) throw new Error("no money");
    expect(await proposeDistribution(mgr, { amountEgp: f.nextDistribution.noi + 1 })).toEqual({ ok: false, error: "too_much" });
    expect(await proposeDistribution(inv, { amountEgp: 1 })).toEqual({ ok: false, error: "forbidden" });
    const p = await proposeDistribution(mgr, { amountEgp: f.nextDistribution.suggested, note: "Standard payout" });
    if (!p.ok) throw new Error(p.error);
    expect(await proposeDistribution(mgr, { amountEgp: 1 })).toEqual({ ok: false, error: "already_proposed" });
    expect(await markDistributionPaid(mgr, p.id)).toEqual({ ok: false, error: "not_approved" });

    const item = (await listApprovals(mgr2)).find((a) => a.id === p.approvalId)!;
    expect(item).toMatchObject({ kind: "distribution", status: "pending" });
    expect(item.summary).toMatchObject({ period: "2026-Q3", amountEgp: f.nextDistribution.suggested });
    expect(await decideApproval(mgr, p.approvalId, "approve")).toEqual({ ok: false, error: "self_approval" });
    expect(await decideApproval(mgr2, p.approvalId, "approve")).toMatchObject({ ok: true, status: "approved" });

    const paid = await markDistributionPaid(mgr, p.id);
    expect(paid.ok).toBe(true);
    const db = await getDb();
    const [d] = await db.select().from(distributions).where(eq(distributions.id, p.id));
    expect(d).toMatchObject({ status: "paid", decidedBy: "u-manager-2", paidOn: "2026-11-12" });
    expect((await db.select().from(outbox).where(eq(outbox.refId, p.id)))[0].to).toBe("karim@sample.test");
    expect((await getFinance(inv))!.distributions.find((x) => x.id === p.id)?.status).toBe("paid");
  });
});

describe("Horus and finance", () => {
  it("routes finance questions without stealing advice questions", () => {
    expect(classify("What is our net operating income?").intent).toBe("finance");
    expect(classify("How are we doing against budget?").intent).toBe("finance");
    expect(classify("ما هي التوزيعات؟").intent).toBe("finance");
    expect(classify("Should I sell to fund a distribution?").intent).toBe("advice");
  });
  it("answers managers with NOI, budget and the next distribution; investors with distributions only", async () => {
    const m = await askHorus(mgr, "Summarise our cash flow and budget", "en", "EGP", { apiKey: undefined, ip: "f1" });
    const txt = m.blocks.map((b) => b.text).join(" ");
    expect(txt).toMatch(/net operating income was/);
    expect(txt).toMatch(/largest shortfall is/);
    expect(m.blocks.every((b) => b.cites.includes("calc:finance_summary"))).toBe(true);
    const i = await askHorus(inv, "What distributions have I received?", "en", "EGP", { apiKey: undefined, ip: "f2" });
    const it2 = i.blocks.map((b) => b.text).join(" ");
    expect(it2).toMatch(/Distributions paid so far total/);
    expect(it2).not.toMatch(/net operating income was|budget/);
  });
});
