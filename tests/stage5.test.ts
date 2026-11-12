import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { auditEvents, investorUpdates, users } from "../src/db/schema";
import { computeAlerts, visibleKind, vacancyCostEgp } from "../src/lib/alerts";
import { attentionCount, getAlerts, reopenAlert, snoozeAlert } from "../src/lib/alerts-service";
import { decideApproval, listApprovals } from "../src/lib/approvals-service";
import { listAudit, restoreDemo, tamperDemo, verifyChain } from "../src/lib/audit-service";
import { feedEvent, gapMs, type FeedAsset } from "../src/lib/feed";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const investor = U("u-investor", "investor"), m1 = U("u-manager-1", "manager"), m2 = U("u-manager-2", "manager"), admin = U("u-admin", "admin");

describe("alert rules (pure)", () => {
  const assets = [{ id: "A-1", type: "apartment", occupancy: "vacant", vacantSince: "2026-07-01", valueEgp: 20_000_000 }, { id: "A-2", type: "retail", occupancy: "vacant", vacantSince: "2026-10-20", valueEgp: 9_000_000 }];
  it("applies every threshold and severity", () => {
    const a = computeAlerts({
      assets, drift: new Map([["A-1", 9.5], ["A-2", -13], ["A-3", 3]]),
      leases: [{ id: "L-1", assetId: "A-1", endDate: "2026-12-01" }, { id: "L-2", assetId: "A-2", endDate: "2027-01-31" }, { id: "L-3", assetId: "A-3", endDate: "2027-03-12" }, { id: "L-4", assetId: "A-4", endDate: "2027-03-13" }],
      docs: [{ id: "D-1", assetId: "A-1", kind: "title_deed", status: "missing", expiresOn: null }, { id: "D-2", assetId: "A-1", kind: "insurance", status: "verified", expiresOn: null }, { id: "D-3", assetId: "A-2", kind: "insurance", status: "expired", expiresOn: "2026-10-01" }, { id: "D-4", assetId: "A-2", kind: "survey", status: "pending", expiresOn: null }],
    }, "2026-11-12");
    const byKey = Object.fromEntries(a.map((x) => [x.key, x]));
    expect(byKey["lease_renewal:A-1"].severity).toBe("high"); // 19 days
    expect(byKey["lease_renewal:A-2"].severity).toBe("medium"); // 80 days
    expect(byKey["lease_renewal:A-3"].severity).toBe("low"); // exactly 120 days
    expect(byKey["lease_renewal:A-4"]).toBeUndefined(); // 121 days
    expect(byKey["missing_document:D-1"].severity).toBe("high");
    expect(byKey["missing_document:D-3"].severity).toBe("high");
    expect(byKey["missing_document:D-4"]).toBeUndefined(); // pending is not an alert
    expect(byKey["missing_document:D-2"]).toBeUndefined();
    expect(byKey["valuation_drift:A-1"].severity).toBe("medium");
    expect(byKey["valuation_drift:A-2"].severity).toBe("high");
    expect(byKey["valuation_drift:A-3"]).toBeUndefined(); // 3% is under the 8% threshold
    expect(byKey["vacancy_cost:A-1"].detail.days).toBe(134);
    expect(byKey["vacancy_cost:A-1"].severity).toBe("medium");
    expect(byKey["vacancy_cost:A-2"]).toBeUndefined(); // 23 days
    expect(a[0].severity).toBe("high"); // sorted most severe first
  });
  it("prices a vacancy from the asset value and market cap rate", () => {
    expect(vacancyCostEgp(20_000_000, "apartment", 30.4375)).toBe(120_000);
    expect(vacancyCostEgp(20_000_000, "apartment", 0)).toBe(0);
  });
  it("shows investors only the non-financial kinds", () => {
    expect(visibleKind("lease_renewal", "investor")).toBe(true);
    expect(visibleKind("missing_document", "investor")).toBe(true);
    expect(visibleKind("vacancy_cost", "investor")).toBe(false);
    expect(visibleKind("valuation_drift", "investor")).toBe(false);
    expect(visibleKind("lease_renewal", "admin")).toBe(false);
  });
});

describe("alerts from the seeded data", () => {
  it("raises every kind for a manager, from the data", async () => {
    const { open } = await getAlerts(m1);
    const n = (k: string) => open.filter((a) => a.kind === k).length;
    expect(n("missing_document")).toBe(5); // 3 missing deeds, 2 expired insurance certificates
    expect(n("vacancy_cost")).toBe(3); // 3 assets vacant for more than 60 days
    expect(n("lease_renewal")).toBeGreaterThanOrEqual(6);
    expect(n("valuation_drift")).toBeGreaterThanOrEqual(1);
    expect(open[0].severity).toBe("high");
    expect(open.find((a) => a.kind === "vacancy_cost")!.detail.costEgp).toBeGreaterThan(0);
  });
  it("gives investors the document and lease alerts, without any financial detail", async () => {
    const { open } = await getAlerts(investor);
    expect(new Set(open.map((a) => a.kind))).toEqual(new Set(["lease_renewal", "missing_document"]));
    expect(JSON.stringify(open)).not.toMatch(/costEgp|driftPct/);
  });
  it("gives the administrator no financial alerts", async () => {
    expect(await getAlerts(admin)).toEqual({ open: [], snoozed: [] });
  });
  it("snoozes with a mandatory logged reason, reopens, and refuses non-managers", async () => {
    const key = (await getAlerts(m1)).open.find((a) => a.kind === "vacancy_cost")!.key;
    expect(await snoozeAlert(investor, key, "I would like to snooze this one")).toEqual({ ok: false, error: "forbidden" });
    expect(await snoozeAlert(m1, key, "short")).toEqual({ ok: false, error: "reason_required" });
    expect(await snoozeAlert(m1, "vacancy_cost:A-999", "A reason that is long enough")).toEqual({ ok: false, error: "not_found" });
    expect(await snoozeAlert(m1, key, "Agent has two viewings booked this week.")).toEqual({ ok: true });
    const after = await getAlerts(m1);
    expect(after.open.some((a) => a.key === key)).toBe(false);
    expect(after.snoozed.find((a) => a.key === key)).toMatchObject({ snoozeReason: "Agent has two viewings booked this week.", snoozedBy: "u-manager-1" });
    const ev = (await (await getDb()).select().from(auditEvents)).filter((e) => e.action === "alert.snooze");
    expect((ev[ev.length - 1].detail as { reason: string }).reason).toContain("two viewings");
    expect(await reopenAlert(m1, key)).toEqual({ ok: true });
    expect((await getAlerts(m1)).open.some((a) => a.key === key)).toBe(true);
  });
  it("counts what needs each person's attention", async () => {
    const c = await attentionCount(m1);
    expect(c.total).toBe(c.alerts + c.approvals);
    expect(c.alerts).toBeGreaterThan(10);
    expect((await attentionCount(investor)).approvals).toBe(0);
    expect(await attentionCount(admin)).toEqual({ alerts: 0, approvals: 1, total: 1 }); // the role-change request
  });
});

describe("approvals queue", () => {
  it("routes each item to the right role and shows why someone cannot decide", async () => {
    const m1q = await listApprovals(m1);
    const by = (id: string) => m1q.find((x) => x.id === id)!;
    expect(by("AP-001")).toMatchObject({ kind: "valuation", canDecide: true, blocked: null }); // proposed by the investor
    expect(by("AP-002")).toMatchObject({ kind: "valuation", canDecide: true, blocked: null, status: "pending" }); // proposed by manager 2, so manager 1 may decide
    expect(by("AP-003")).toMatchObject({ kind: "update_draft", canDecide: false, blocked: "self" }); // manager 1's own draft
    expect(m1q.find((x) => x.id === "AP-004")).toBeUndefined(); // admin-routed, not visible to manager 1
    const m2q = await listApprovals(m2);
    expect(m2q.find((x) => x.id === "AP-002")).toMatchObject({ canDecide: false, blocked: "self" });
    expect(m2q.find((x) => x.id === "AP-003")).toMatchObject({ canDecide: true });
    expect(m2q.find((x) => x.id === "AP-004")).toMatchObject({ canDecide: false, blocked: "role" }); // their own request, routed to the admin
    const aq = await listApprovals(admin);
    expect(aq.map((x) => x.id)).toEqual(["AP-004"]);
    expect(aq[0]).toMatchObject({ kind: "role_change", canDecide: true });
    expect((await listApprovals(investor)).every((x) => x.proposedBy === "u-investor" || x.routeRole === "investor")).toBe(true);
  });
  it("publishes a draft only when a different manager approves", async () => {
    expect(await decideApproval(m1, "AP-003", "approve")).toEqual({ ok: false, error: "self_approval" });
    expect(await decideApproval(investor, "AP-003", "approve")).toEqual({ ok: false, error: "forbidden" });
    expect(await decideApproval(admin, "AP-003", "approve")).toEqual({ ok: false, error: "not_found" });
    const db = await getDb();
    expect((await db.select().from(investorUpdates).where(eq(investorUpdates.id, "U-012")))[0].status).toBe("draft");
    expect(await decideApproval(m2, "AP-003", "approve")).toEqual({ ok: true, status: "approved" });
    expect((await db.select().from(investorUpdates).where(eq(investorUpdates.id, "U-012")))[0].status).toBe("published");
    expect(await decideApproval(m2, "AP-003", "approve")).toEqual({ ok: false, error: "not_pending" });
    expect((await db.select().from(auditEvents)).some((e) => e.action === "update.publish" && e.entityId === "U-012")).toBe(true);
  });
  it("sends valuation decisions through the valuation rules (two approvers above 10%)", async () => {
    expect(await decideApproval(m1, "AP-001", "approve")).toMatchObject({ ok: true, status: "in_review", detail: "1/2" });
    expect(await decideApproval(m1, "AP-001", "approve")).toMatchObject({ ok: false });
    expect(await decideApproval(m2, "AP-001", "approve")).toMatchObject({ ok: true, status: "confirmed" });
    expect(await decideApproval(m2, "AP-002", "approve")).toEqual({ ok: false, error: "self_approval" });
  });
  it("lets only the administrator decide a role change, and only records it", async () => {
    expect(await decideApproval(m2, "AP-004", "approve")).toEqual({ ok: false, error: "forbidden" });
    const db = await getDb();
    const before = (await db.select().from(users).where(eq(users.id, "u-investor")))[0].role;
    expect(await decideApproval(admin, "AP-004", "approve")).toEqual({ ok: true, status: "approved" });
    expect((await db.select().from(users).where(eq(users.id, "u-investor")))[0].role).toBe(before);
    const ev = (await db.select().from(auditEvents)).filter((e) => e.action === "role.change.decide");
    expect(ev[ev.length - 1].detail).toMatchObject({ decision: "approve", recordedOnly: true });
  });
});

describe("audit log, chain verification and the tamper demo", () => {
  it("is readable by the administrator only", async () => {
    expect((await listAudit(admin)).total).toBeGreaterThan(20);
    expect((await listAudit(m1)).total).toBe(0);
    expect((await listAudit(investor)).rows).toEqual([]);
  });
  it("filters and searches", async () => {
    const v = await listAudit(admin, { action: "valuation" });
    expect(v.rows.length).toBeGreaterThan(3);
    expect(v.rows.every((r) => r.action.startsWith("valuation."))).toBe(true);
    expect((await listAudit(admin, { q: "V-0016" })).rows.length).toBeGreaterThan(0);
    expect(v.rows[0].seq).toBeGreaterThan(v.rows[v.rows.length - 1].seq); // newest first
  });
  it("verifies a clean chain", async () => {
    const c = await verifyChain();
    expect(c.ok).toBe(true);
    expect(c.firstBad).toBeNull();
    expect(c.count).toBe(c.headSeq);
  });
  it("catches an edit made behind the chain's back, names the first broken event, then passes after restore", async () => {
    expect(await tamperDemo(m1)).toEqual({ ok: false, error: "forbidden" });
    expect(await restoreDemo(admin)).toEqual({ ok: false, error: "nothing_to_restore" });
    expect(await tamperDemo(admin)).toEqual({ ok: true, seq: 7 });
    const bad = await verifyChain();
    expect(bad.ok).toBe(false);
    expect(bad.firstBad).toMatchObject({ index: 6, seq: 7, kind: "hash" });
    expect(bad.firstBad!.expected).not.toBe(bad.firstBad!.found);
    expect(await tamperDemo(admin)).toEqual({ ok: false, error: "already_tampered" });
    expect(await restoreDemo(admin)).toEqual({ ok: true });
    expect((await verifyChain()).ok).toBe(true);
    const actions = (await (await getDb()).select().from(auditEvents)).map((e) => e.action);
    expect(actions).toContain("audit.demo_tamper");
    expect(actions).toContain("audit.demo_restore");
  });
  it("also catches a broken link between events", async () => {
    const db = await getDb();
    const [e] = await db.select().from(auditEvents).where(eq(auditEvents.seq, 5));
    await db.update(auditEvents).set({ prevHash: "e".repeat(64) }).where(eq(auditEvents.seq, 5));
    expect((await verifyChain()).firstBad).toMatchObject({ seq: 5, kind: "link" });
    await db.update(auditEvents).set({ prevHash: e.prevHash }).where(eq(auditEvents.seq, 5));
    expect((await verifyChain()).ok).toBe(true);
  });
});

describe("simulated feed", () => {
  const assets: FeedAsset[] = [
    { id: "A-1", name: "One", nameAr: "واحد", occupancy: "let", tenant: "T", monthlyRent: 100000, currency: "EGP" },
    { id: "A-2", name: "Two", nameAr: "اثنان", occupancy: "vacant", tenant: null, monthlyRent: null, currency: null },
  ];
  it("is deterministic and always flagged simulated", () => {
    for (let i = 0; i < 12; i++) {
      const a = feedEvent(i, "manager", assets, "t"), b = feedEvent(i, "manager", assets, "t");
      expect(a).toEqual(b);
      expect(a.simulated).toBe(true);
    }
    expect(gapMs(5)).toBe(gapMs(5));
    expect(gapMs(0)).toBe(3000);
    for (let i = 1; i < 20; i++) { expect(gapMs(i)).toBeGreaterThanOrEqual(20000); expect(gapMs(i)).toBeLessThanOrEqual(40000); }
    expect(gapMs(3, 800)).toBe(800);
  });
  it("cycles through rent receipts, enquiries and valuation changes", () => {
    expect(new Set([0, 1, 2].map((i) => feedEvent(i, "manager", assets, "t").kind))).toEqual(new Set(["rent_receipt", "new_enquiry", "valuation_change"]));
    expect(feedEvent(1, "manager", assets, "t").assetId).toBe("A-2"); // enquiries are about vacant units
  });
  it("hides rent from investors and gives the administrator only system events", () => {
    expect(feedEvent(0, "manager", assets, "t").amountEgp).toBe(100000);
    expect(feedEvent(0, "investor", assets, "t").amountEgp).toBeNull();
    for (let i = 0; i < 6; i++) { const e = feedEvent(i, "admin", assets, "t"); expect(e.kind).toBe("system"); expect(e.assetId).toBeNull(); }
  });
});
