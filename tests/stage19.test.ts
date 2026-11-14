import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "19.1.1.1" }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { eq } from "drizzle-orm";
import { getDb, withSession } from "../src/db/client";
import { capexItems, contractors, utilityReadings, workOrders } from "../src/db/schema";
import { addReading, assignContractor, consumption, contractorStats, createContractor, decideCapex, listCapex, listContractors, listInspections, listUtilities, proposeCapex, rateWork, recordInspection, scheduleInspection, updateCapex } from "../src/lib/ops";
import { buildEInvoice, listInvoicesForEInvoice } from "../src/lib/einvoice";
import { listNotifications } from "../src/lib/notify";
import { DEMO_TODAY } from "../src/lib/assumptions";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const m1 = U("u-manager-1", "manager"), m2 = U("u-manager-2", "manager"), inv = U("u-investor", "investor"), an = U("u-analyst", "analyst"), adm = U("u-admin", "admin");

describe("contractors", () => {
  it("performance comes from their jobs: on time, days, cost against estimate, rating", () => {
    const jobs = [
      { contractorId: "C", status: "done", dueOn: "2026-01-10", completedOn: "2026-01-08", createdAt: new Date("2026-01-01T00:00:00Z"), estimateEgp: 1000, actualEgp: 1200, rating: 4 },
      { contractorId: "C", status: "done", dueOn: "2026-02-01", completedOn: "2026-02-05", createdAt: new Date("2026-01-26T00:00:00Z"), estimateEgp: 1000, actualEgp: 1000, rating: 2 },
      { contractorId: "C", status: "open", dueOn: null, completedOn: null, createdAt: new Date(), estimateEgp: null, actualEgp: null, rating: null },
      { contractorId: "X", status: "done", dueOn: null, completedOn: "2026-01-01", createdAt: new Date("2026-01-01T00:00:00Z"), estimateEgp: null, actualEgp: null, rating: 5 },
    ];
    expect(contractorStats({ id: "C" }, jobs, true)).toEqual({ jobs: 3, done: 2, open: 1, onTimePct: 50, avgDays: 9, costVariancePct: 10, rating: 3, ratings: 2 });
    expect(contractorStats({ id: "C" }, jobs, false).costVariancePct).toBeNull();
  });

  it("seeded contractors are linked to their work orders; investors see them without costs; analysts and admins too/not", async () => {
    const l = (await listContractors(m1))!;
    expect(l.length).toBe(7);
    expect(l.reduce((s, c) => s + c.jobs, 0)).toBeGreaterThan(0);
    expect(l.some((c) => c.rating !== null)).toBe(true);
    const li = (await listContractors(inv))!;
    expect(li.every((c) => c.costVariancePct === null)).toBe(true);
    expect(await listContractors(an)).not.toBeNull();
    expect(await listContractors(adm)).toBeNull();
  });

  it("only managers add contractors; names are unique", async () => {
    expect(await createContractor(inv, { name: "X Co", trade: "general", email: "x@x.example" })).toEqual({ ok: false, error: "forbidden" });
    expect(await createContractor(m1, { name: "Nile Lifts (fictional)", trade: "lift", email: "a@b.example" })).toEqual({ ok: false, error: "taken" });
    expect(await createContractor(m1, { name: "Bad", trade: "nope", email: "a@b.example" })).toEqual({ ok: false, error: "invalid" });
    expect(await createContractor(m1, { name: "Giza Glass (fictional)", trade: "general", email: "hi@giza-glass.example" })).toEqual({ ok: true, id: "CT-008" });
  });

  it("assign a contractor to an open job, then rate it once done; closed jobs refuse reassignment", async () => {
    const db = await getDb();
    const [open] = await db.select().from(workOrders).where(eq(workOrders.status, "open")).limit(1);
    expect(await assignContractor(m1, open.id, "CT-008")).toEqual({ ok: true });
    const [w] = await db.select().from(workOrders).where(eq(workOrders.id, open.id));
    expect(w).toMatchObject({ contractorId: "CT-008", vendor: "Giza Glass (fictional)" });
    expect(await rateWork(m1, open.id, 4)).toEqual({ ok: false, error: "closed" });
    const [done] = await db.select().from(workOrders).where(eq(workOrders.status, "done")).limit(1);
    expect(await assignContractor(m1, done.id, "CT-008")).toEqual({ ok: false, error: "closed" });
    if (done.contractorId) {
      expect(await rateWork(m1, done.id, 6)).toEqual({ ok: false, error: "invalid" });
      expect(await rateWork(m1, done.id, 5)).toMatchObject({ ok: true });
    }
    expect(await assignContractor(m1, open.id, "CT-999")).toEqual({ ok: false, error: "invalid" });
  });
});

describe("inspections", () => {
  it("lists past and planned inspections with findings linked to work orders", async () => {
    const l = (await listInspections(inv))!;
    expect(l.items.length).toBe(6);
    expect(l.items.find((x) => x.id === "IS-001")!.findings[0].workOrderId).toBe("WO-001");
    expect(await listInspections(adm)).toBeNull();
  });

  it("schedules one (not in the past) and tells the inspector", async () => {
    expect(await scheduleInspection(inv, {})).toEqual({ ok: false, error: "forbidden" });
    expect(await scheduleInspection(m1, { assetId: "A-001", kind: "routine", scheduledOn: "2020-01-01", inspectorId: "u-manager-2" })).toEqual({ ok: false, error: "invalid" });
    expect(await scheduleInspection(m1, { assetId: "A-001", kind: "routine", scheduledOn: DEMO_TODAY, inspectorId: "u-investor" })).toEqual({ ok: false, error: "invalid" });
    const r = await scheduleInspection(m1, { assetId: "A-001", kind: "move_out", scheduledOn: DEMO_TODAY, inspectorId: "u-manager-2", contractorId: "" });
    expect(r).toEqual({ ok: true, id: "IS-007" });
    const n = await listNotifications(m2, "en");
    expect(n.find((x) => x.kind === "inspection_assigned")!.title).toBe(`Inspection IS-007 at A-001 on ${DEMO_TODAY} is yours`);
    expect((await listNotifications(m2, "ar")).find((x) => x.kind === "inspection_assigned")!.title).toContain("IS-007");
  });

  it("records the result; findings can raise work orders; a done inspection cannot be recorded again", async () => {
    expect(await recordInspection(m2, "IS-007", { result: "issues", findings: [] })).toEqual({ ok: false, error: "invalid" });
    const r = await recordInspection(m2, "IS-007", { result: "issues", notes: "Tenant left.", findings: [{ area: "Kitchen", severity: "high", note: "Hob not working.", createWork: true }, { area: "Walls", severity: "low", note: "Scuffs in hall.", createWork: false }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created.length).toBe(1);
    const i = (await listInspections(m1))!.items.find((x) => x.id === "IS-007")!;
    expect(i).toMatchObject({ status: "done", result: "issues", doneOn: DEMO_TODAY });
    expect(i.findings.map((f) => !!f.workOrderId)).toEqual([true, false]);
    const db = await getDb();
    const [w] = await db.select().from(workOrders).where(eq(workOrders.id, r.created[0]));
    expect(w).toMatchObject({ assetId: "A-001", priority: "high" });
    expect(await recordInspection(m2, "IS-007", { result: "pass" })).toEqual({ ok: false, error: "closed" });
  });
});

describe("utilities", () => {
  it("consumption is the difference between readings, and a spike over 1.5x the last three is flagged", () => {
    const p = consumption([{ readOn: "2026-01-01", reading: 0, costEgp: null }, { readOn: "2026-02-01", reading: 10, costEgp: 20 }, { readOn: "2026-03-01", reading: 20, costEgp: 20 }, { readOn: "2026-04-01", reading: 30, costEgp: 20 }, { readOn: "2026-05-01", reading: 46, costEgp: 32 }, { readOn: "2026-06-01", reading: 60, costEgp: 28 }]);
    expect(p.map((x) => x.use)).toEqual([10, 10, 10, 16, 14]);
    expect(p.map((x) => x.anomaly)).toEqual([false, false, false, true, false]);
  });

  it("the seeded A-008 water meter shows the September spike; investors and admins cannot see utilities", async () => {
    const l = (await listUtilities(m1))!;
    const w = l.meters.find((m) => m.assetId === "A-008" && m.utility === "water")!;
    expect(w.periods.filter((p) => p.anomaly).map((p) => p.to.slice(0, 7))).toEqual(["2026-09"]);
    expect(l.meters.length).toBe(6);
    expect(await listUtilities(inv)).toBeNull();
    expect(await listUtilities(adm)).toBeNull();
    expect(await listUtilities(an)).not.toBeNull();
  });

  it("a reading must be later and not lower; it flags a spike at once; readings cannot be changed in the database", async () => {
    const last = (await listUtilities(m1))!.meters.find((m) => m.assetId === "A-001" && m.utility === "electricity")!.last!;
    expect(await addReading(m1, { assetId: "A-001", utility: "electricity", readOn: last.readOn, reading: last.reading + 5 })).toEqual({ ok: false, error: "lower" });
    expect(await addReading(m1, { assetId: "A-001", utility: "electricity", readOn: DEMO_TODAY, reading: last.reading - 1 })).toEqual({ ok: false, error: "lower" });
    expect(await addReading(m1, { assetId: "A-001", utility: "electricity", readOn: "2027-01-01", reading: last.reading + 5 })).toEqual({ ok: false, error: "invalid" });
    expect(await addReading(inv, { assetId: "A-001", utility: "electricity", readOn: DEMO_TODAY, reading: last.reading + 5 })).toEqual({ ok: false, error: "forbidden" });
    const r = await addReading(m1, { assetId: "A-001", utility: "electricity", readOn: DEMO_TODAY, reading: last.reading + 5000, costEgp: "" });
    expect(r).toMatchObject({ ok: true, anomaly: true });
    await expect(withSession({ userId: m1.id, role: "manager" }, (tx) => tx.update(utilityReadings).set({ reading: "1" }).where(eq(utilityReadings.assetId, "A-001")))).rejects.toThrow();
  });
});

describe("capital works", () => {
  it("totals cover approved, running and finished items; investors cannot see them", async () => {
    const l = (await listCapex(m1))!;
    expect(l.items.length).toBe(5);
    expect(l.totals).toEqual({ approvedBudget: 1_150_000 + 620_000 + 950_000, spent: 410_000 + 905_000, awaiting: 1 });
    expect(await listCapex(inv)).toBeNull();
  });

  it("four eyes: the proposer cannot decide; rejection needs a reason; decided items are closed", async () => {
    const p = await proposeCapex(m1, { assetId: "A-001", title: "New kitchen", category: "interior", budgetEgp: 300000, usefulLifeYears: 10, expectedUpliftEgp: "", startOn: "", contractorId: "", note: "" });
    expect(p).toEqual({ ok: true, id: "CX-006" });
    expect(await proposeCapex(m1, { assetId: "A-001", title: "x", category: "roof", budgetEgp: 1 })).toEqual({ ok: false, error: "invalid" });
    expect((await listNotifications(m2, "en")).find((x) => x.kind === "approval_request")!.title).toBe("Capital works CX-006 is waiting for your approval");
    expect(await decideCapex(m1, "CX-006", "approve")).toEqual({ ok: false, error: "own" });
    expect(await decideCapex(m2, "CX-006", "reject", "no")).toEqual({ ok: false, error: "invalid" });
    expect(await decideCapex(m2, "CX-006", "approve", "Fine")).toMatchObject({ ok: true });
    expect(await decideCapex(m2, "CX-006", "reject", "Changed my mind")).toEqual({ ok: false, error: "closed" });
    expect(await decideCapex(inv, "CX-002", "approve")).toEqual({ ok: false, error: "forbidden" });
  });

  it("progress: spending only goes up, over budget is reported, done items are closed", async () => {
    expect(await updateCapex(m1, "CX-002", { status: "in_progress", spentEgp: 10 })).toEqual({ ok: false, error: "closed" }); // still proposed
    expect(await updateCapex(m1, "CX-006", { status: "in_progress", spentEgp: 100000 })).toEqual({ ok: true, overBudget: false });
    expect(await updateCapex(m1, "CX-006", { status: "in_progress", spentEgp: 50000 })).toEqual({ ok: false, error: "lower" });
    expect(await updateCapex(m1, "CX-006", { status: "done", spentEgp: 320000 })).toEqual({ ok: true, overBudget: true });
    const db = await getDb();
    const [x] = await db.select().from(capexItems).where(eq(capexItems.id, "CX-006"));
    expect(x).toMatchObject({ status: "done", completedOn: DEMO_TODAY, spentEgp: 320000 });
    expect(await updateCapex(m1, "CX-006", { status: "done", spentEgp: 330000 })).toEqual({ ok: false, error: "closed" });
  });

  it("row-level security: investors read no capital works and cannot write contractors", async () => {
    const rows = await withSession({ userId: inv.id, role: "investor" }, (tx) => tx.select().from(capexItems));
    expect(rows.length).toBe(0);
    await expect(withSession({ userId: inv.id, role: "investor" }, (tx) => tx.insert(contractors).values({ id: "CT-900", name: "x", nameAr: "x", trade: "general", email: "x@x.example", active: 1, createdAt: new Date() }))).rejects.toThrow();
  });
});

describe("e-invoice drafts", () => {
  it("managers only", async () => {
    expect(await listInvoicesForEInvoice(inv)).toBeNull();
    expect(await buildEInvoice(an, "x")).toBeNull();
    expect((await listInvoicesForEInvoice(m1))!.length).toBeGreaterThan(0);
  });

  it("builds a balanced ETA-shaped document; residential is exempt, other rent at 14%; it is never 'ready' without registration and a signature", async () => {
    const list = (await listInvoicesForEInvoice(m1))!;
    const res = list.find((r) => ["apartment", "villa"].includes(r.type))!;
    const com = list.find((r) => !["apartment", "villa"].includes(r.type))!;
    const a = (await buildEInvoice(m1, res.i.id))!;
    expect(a.doc).toMatchObject({ documentType: "I", documentTypeVersion: "1.0", internalID: res.i.id, taxpayerActivityCode: "6810" });
    expect(a.doc.invoiceLines[0].taxableItems[0]).toMatchObject({ taxType: "T1", rate: 0, amount: 0, subType: "V003" });
    const b = (await buildEInvoice(m1, com.i.id))!;
    const line = b.doc.invoiceLines[0];
    expect(line.taxableItems[0]).toMatchObject({ rate: 14, subType: "V009" });
    expect(line.taxableItems[0].amount).toBeCloseTo(com.i.amountEgp * 0.14, 5);
    expect(b.doc.totalAmount).toBeCloseTo(com.i.amountEgp * 1.14, 5);
    for (const r of [a, b]) {
      expect(r.checks.filter((c) => c.level === "error").every((c) => c.ok)).toBe(true);
      expect(r.checks.find((c) => c.id === "signature")!.ok).toBe(false);
      expect(r.ready).toBe(false);
    }
    const usd = list.find((r) => r.i.currency === "USD");
    if (usd) expect((await buildEInvoice(m1, usd.i.id))!.doc.invoiceLines[0].unitValue).toMatchObject({ currencySold: "USD" });
    expect(await buildEInvoice(m1, "RI-NOPE")).toBeNull();
  });
});
