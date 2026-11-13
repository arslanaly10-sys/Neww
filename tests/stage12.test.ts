import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "12.1.1.1" }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { eq } from "drizzle-orm";
import { getDb, withSession } from "../src/db/client";
import { notifications, outbox } from "../src/db/schema";
import { getPrefs, listNotifications, markRead, notify, renderNotification, setPrefs, unreadCount } from "../src/lib/notify";
import { createWork, completeWork, updateWork } from "../src/lib/work";
import { submitLead } from "../src/lib/leads";
import { getFinance, markDistributionPaid, proposeDistribution } from "../src/lib/finance";
import { decideApproval } from "../src/lib/approvals-service";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const mgr = U("u-manager-1", "manager"), mgr2 = U("u-manager-2", "manager"), inv = U("u-investor", "investor"), adm = U("u-admin", "admin");
const kinds = async (u: CurrentUser) => (await listNotifications(u, "en")).map((n) => n.kind);

describe("rendering", () => {
  it("builds the sentence from the kind and its parameters, in both languages", () => {
    expect(renderNotification("approval_request", { id: "V-0016", what: "valuation" }, "en").title).toBe("Valuation V-0016 is waiting for your approval");
    expect(renderNotification("approval_decided", { id: "DS-003", outcome: "rejected" }, "en").title).toBe("DS-003 was rejected");
    expect(renderNotification("approval_decided", { id: "DS-003", outcome: "approved" }, "ar").title).toBe("اعتُمد DS-003");
    expect(renderNotification("work_assigned", { id: "WO-001", title: "Fix" }, "en").body).toBe("");
  });
});

describe("the inbox", () => {
  it("shows each person only their own notifications, newest first, and counts unread", async () => {
    const m = await listNotifications(mgr, "en");
    expect(m.length).toBeGreaterThanOrEqual(4);
    expect(m[0].createdAt >= m[m.length - 1].createdAt).toBe(true);
    expect(await unreadCount(mgr)).toBe(3);
    expect((await listNotifications(inv, "en")).every((n) => ["distribution_paid", "work_completed"].includes(n.kind))).toBe(true);
    // Row-level security: another person's notification cannot be read or marked.
    const theirs = await withSession({ userId: mgr2.id, role: "manager" }, (tx) => tx.select().from(notifications).where(eq(notifications.id, "N-seed-01")));
    expect(theirs).toEqual([]);
    expect(await markRead(mgr2, ["N-seed-01"])).toBe(0);
  });
  it("marks one, then all, as read", async () => {
    expect(await markRead(mgr, ["N-seed-01"])).toBe(1);
    expect(await unreadCount(mgr)).toBe(2);
    expect(await markRead(mgr, "all")).toBe(2);
    expect(await unreadCount(mgr)).toBe(0);
  });
});

describe("who is told", () => {
  it("never tells people about their own acts, and respects preferences", async () => {
    expect(await notify({ to: { roles: ["manager"] }, kind: "work_reported", params: { id: "WO-X", title: "x" }, actorId: "u-manager-1" })).toBe(1);
    expect(await kinds(mgr2)).toContain("work_reported");
    expect(await setPrefs(inv, [{ category: "finance", inApp: false, email: true }])).toEqual({ ok: true });
    expect((await getPrefs(inv)).find((p) => p.category === "finance")).toEqual({ category: "finance", inApp: false, email: true });
    expect(await setPrefs(inv, [{ category: "nope", inApp: true, email: true }])).toEqual({ ok: false, error: "invalid" });
    const before = (await listNotifications(inv, "en")).length;
    await notify({ to: { users: ["u-investor"] }, kind: "distribution_paid", params: { id: "DS-9", period: "2026-Q3", amount: "1" } });
    expect((await listNotifications(inv, "en")).length).toBe(before); // in-app off
    const db = await getDb();
    expect((await db.select().from(outbox).where(eq(outbox.kind, "notify_distribution_paid"))).some((m) => m.to === "karim@sample.test")).toBe(true);
    await setPrefs(inv, [{ category: "finance", inApp: true, email: false }]);
  });

  it("is wired to the events that matter", async () => {
    // An investor's report reaches the managers; assigning reaches the assignee; finishing reaches the reporter.
    const r = await createWork(inv, { assetId: "A-006", title: "Garage door stuck", category: "structural" });
    if (!r.ok) throw new Error(r.error);
    expect(await kinds(mgr)).toContain("work_reported");
    await updateWork(mgr, r.id, { assigneeId: "u-manager-2" });
    expect((await listNotifications(mgr2, "en")).some((n) => n.kind === "work_assigned" && n.title.includes(r.id))).toBe(true);
    await completeWork(mgr2, r.id, {});
    expect((await listNotifications(inv, "en")).some((n) => n.kind === "work_completed" && n.title.includes(r.id))).toBe(true);
    // A demo request reaches managers and the administrator.
    await submitLead({ name: "Rania Adel", email: "rania@example.com" }, "en", "n1");
    expect(await kinds(adm)).toContain("lead_new");
    // A distribution: proposal to the other managers, decision back to the proposer, payment to the investor.
    const f = await getFinance(mgr);
    if (!f || !f.money) throw new Error("no money");
    const p = await proposeDistribution(mgr, { amountEgp: f.nextDistribution.suggested });
    if (!p.ok) throw new Error(p.error);
    expect((await listNotifications(mgr2, "en")).some((n) => n.title === `Distribution ${p.id} is waiting for your approval`)).toBe(true);
    expect((await listNotifications(mgr, "en")).some((n) => n.title.includes(`Distribution ${p.id} is waiting`))).toBe(false);
    await decideApproval(mgr2, p.approvalId, "approve");
    expect((await listNotifications(mgr, "en")).some((n) => n.title === `${p.id} was approved`)).toBe(true);
    await markDistributionPaid(mgr, p.id);
    expect((await listNotifications(inv, "en")).some((n) => n.kind === "distribution_paid" && n.title.includes(p.id))).toBe(true);
  });
});
