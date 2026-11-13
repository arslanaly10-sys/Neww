import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "10.1.1.1" }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { eq } from "drizzle-orm";
import { getDb, withSession } from "../src/db/client";
import { auditEvents, ledgerEntries, workOrderEvents, workOrders } from "../src/db/schema";
import { addWorkNote, boardOrder, completeWork, createWork, getWorkOrder, isOverdue, listWork, updateWork } from "../src/lib/work";
import { askHorus } from "../src/lib/horus/gateway";
import { classify } from "../src/lib/horus/scripted";
import { resolveCitation } from "../src/lib/horus/citations";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const mgr = U("u-manager-1", "manager"), mgr2 = U("u-manager-2", "manager"), inv = U("u-investor", "investor"), adm = U("u-admin", "admin");

describe("work rules", () => {
  it("counts only active work past its due date as overdue", () => {
    expect(isOverdue({ status: "open", dueOn: "2026-11-01" }, "2026-11-12")).toBe(true);
    expect(isOverdue({ status: "on_hold", dueOn: "2026-11-01" }, "2026-11-12")).toBe(true);
    expect(isOverdue({ status: "done", dueOn: "2026-11-01" }, "2026-11-12")).toBe(false);
    expect(isOverdue({ status: "open", dueOn: "2026-11-12" }, "2026-11-12")).toBe(false);
    expect(isOverdue({ status: "open", dueOn: null }, "2026-11-12")).toBe(false);
  });
  it("orders the board: overdue, then priority, then the soonest due", () => {
    const xs = [
      { id: "a", status: "open", priority: "low", dueOn: "2026-12-01" }, { id: "b", status: "open", priority: "urgent", dueOn: "2026-12-05" },
      { id: "c", status: "open", priority: "low", dueOn: "2026-11-01" }, { id: "d", status: "open", priority: "urgent", dueOn: "2026-11-30" },
    ];
    expect([...xs].sort(boardOrder).map((x) => x.id)).toEqual(["c", "d", "b", "a"]);
  });
});

describe("seeded work and roles", () => {
  it("has work in every state, two overdue, and the investor's own report", async () => {
    const w = (await listWork(mgr))!;
    expect(new Set(w.items.map((x) => x.status))).toEqual(new Set(["open", "in_progress", "on_hold", "done", "cancelled"]));
    expect(w.items.filter((x) => x.overdue).map((x) => x.id).sort()).toEqual(["WO-003", "WO-005"]);
    expect(w.items.find((x) => x.id === "WO-003")?.reportedBy).toBe("u-investor");
    expect(w.items.find((x) => x.id === "WO-001")).toMatchObject({ actualEgp: 212_000, ledgerEntryId: "LE-seed-04" });
  });
  it("shows investors the work but never its costs, including on the timeline", async () => {
    const w = (await listWork(inv))!;
    expect(w.money).toBe(false);
    expect(w.items.every((x) => x.estimateEgp === null && x.actualEgp === null && x.ledgerEntryId === null)).toBe(true);
    const d = (await getWorkOrder(inv, "WO-001"))!;
    expect(d.events.every((e) => !("actualEgp" in e.detail))).toBe(true);
    expect(await listWork(adm)).toBeNull();
  });
});

describe("creating work", () => {
  it("lets investors report maintenance only, at normal priority, unassigned", async () => {
    expect(await createWork(inv, { kind: "task", title: "Do my taxes", category: "admin" })).toEqual({ ok: false, error: "forbidden" });
    expect(await createWork(inv, { assetId: "A-003", title: "Door bell broken", category: "electrical", priority: "urgent" })).toEqual({ ok: false, error: "forbidden" });
    const r = await createWork(inv, { assetId: "A-003", title: "Door bell broken", category: "electrical", description: "Front gate bell silent." });
    expect(r.ok).toBe(true);
    const w = (await listWork(mgr))!.items.find((x) => x.id === (r as { id: string }).id)!;
    expect(w).toMatchObject({ status: "open", priority: "normal", assigneeId: null, reportedBy: "u-investor", assetId: "A-003" });
  });
  it("validates: maintenance needs an asset, titles need substance, due dates not in the past, assignees must be managers", async () => {
    expect(await createWork(mgr, { title: "Fix something", category: "plumbing" })).toEqual({ ok: false, error: "invalid" });
    expect(await createWork(mgr, { assetId: "A-001", title: "Fix", category: "plumbing" })).toEqual({ ok: false, error: "invalid" });
    expect(await createWork(mgr, { assetId: "A-001", title: "Fix the tap", category: "plumbing", dueOn: "2026-01-01" })).toEqual({ ok: false, error: "invalid" });
    expect(await createWork(mgr, { assetId: "A-001", title: "Fix the tap", category: "plumbing", assigneeId: "u-investor" })).toEqual({ ok: false, error: "invalid" });
    const task = await createWork(mgr, { kind: "task", title: "Book the annual audit", category: "admin", priority: "high", assigneeId: "u-manager-2", dueOn: "2026-12-01" });
    expect(task.ok).toBe(true);
    // The investor cannot write rows the policy forbids, even bypassing the service.
    await expect(withSession({ userId: inv.id, role: "investor" }, (tx) => tx.insert(workOrders).values({ id: "WO-999", kind: "task", title: "x", category: "admin", priority: "urgent", status: "open", reportedBy: "u-investor", createdAt: new Date(), updatedAt: new Date() }))).rejects.toThrow();
  });
});

describe("managing work", () => {
  it("records each change on the timeline and in the audit chain; investors cannot change work", async () => {
    expect(await updateWork(inv, "WO-004", { status: "in_progress" })).toEqual({ ok: false, error: "forbidden" });
    const r = await updateWork(mgr, "WO-004", { status: "in_progress", priority: "high", vendor: "BrightSpark (fictional)", dueOn: "2026-11-25" });
    expect(r).toMatchObject({ ok: true, changed: ["status", "priority", "assigned", "due"] });
    expect(await updateWork(mgr, "WO-004", { status: "in_progress" })).toEqual({ ok: true, changed: [], auditSeq: null });
    const d = (await getWorkOrder(mgr, "WO-004"))!;
    expect(d.work).toMatchObject({ status: "in_progress", priority: "high", vendor: "BrightSpark (fictional)", dueOn: "2026-11-25" });
    expect(d.events.map((e) => e.kind).slice(-4)).toEqual(["status", "priority", "assigned", "due"]);
    expect(await updateWork(mgr, "WO-001", { status: "open" })).toEqual({ ok: false, error: "closed" });
  });
  it("completing a repair writes its cost to the finance ledger", async () => {
    const r = await completeWork(mgr2, "WO-002", { actualEgp: 91_000, note: "Compressor replaced." });
    if (!r.ok) throw new Error(r.error);
    expect(r.ledgerEntryId).toMatch(/^LE-/);
    const db = await getDb();
    const [le] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, r.ledgerEntryId!));
    expect(le).toMatchObject({ category: "maintenance", amountEgp: -91_000, assetId: "A-002", entryDate: "2026-11-12" });
    expect(le.memo).toContain("WO-002");
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, "WO-002"));
    expect(wo).toMatchObject({ status: "done", actualEgp: 91_000, completedOn: "2026-11-12" });
    expect(await completeWork(mgr, "WO-002", {})).toEqual({ ok: false, error: "closed" });
    // A task completes without touching the ledger.
    const t = await completeWork(mgr, "WO-011", { note: "Letter drafted." });
    expect(t).toMatchObject({ ok: true, ledgerEntryId: null });
    expect((await db.select().from(auditEvents).where(eq(auditEvents.action, "work.complete"))).length).toBeGreaterThanOrEqual(2);
  });
  it("lets investors and managers add notes, but not empty ones", async () => {
    expect(await addWorkNote(inv, "WO-003", "The leak is worse today.")).toEqual({ ok: true });
    expect(await addWorkNote(inv, "WO-003", " ")).toEqual({ ok: false, error: "invalid" });
    expect(await addWorkNote(adm, "WO-003", "hello")).toEqual({ ok: false, error: "forbidden" });
    const db = await getDb();
    expect((await db.select().from(workOrderEvents).where(eq(workOrderEvents.workOrderId, "WO-003"))).some((e) => e.text === "The leak is worse today." && e.actorId === "u-investor")).toBe(true);
  });
});

describe("Horus and work", () => {
  it("answers maintenance questions with counts and the most pressing jobs, cited", async () => {
    expect(classify("What maintenance is overdue?").intent).toBe("work");
    expect(classify("ما أعمال الصيانة المتأخرة؟").intent).toBe("work");
    const a = await askHorus(mgr, "What maintenance is overdue?", "en", "EGP", { apiKey: undefined, ip: "w1" });
    expect(a.blocks[0].text).toMatch(/pieces of work are open: \d+ overdue/);
    expect(a.blocks[1].cites.every((c) => /^work:WO-\d{3}$/.test(c))).toBe(true);
    const chip = await resolveCitation(inv, a.blocks[1].cites[0], "en", "EGP");
    expect(chip?.href).toMatch(/^\/maintenance\/WO-\d{3}$/);
  });
});
