import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "20.1.1.1" }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { eq } from "drizzle-orm";
import { withSession } from "../src/db/client";
import { permits } from "../src/db/schema";
import { assetCompliance, permitState, requiredFor } from "../src/lib/permits-rules";
import { assetPermits, permitRegister, permitReminders, recordPermit, reviewPermit } from "../src/lib/permits";
import { listNotifications } from "../src/lib/notify";
import { DEMO_TODAY } from "../src/lib/assumptions";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const m1 = U("u-manager-1", "manager"), inv = U("u-investor", "investor"), an = U("u-analyst", "analyst"), adm = U("u-admin", "admin");

describe("permit rules", () => {
  it("requirements follow the asset type, trimmed while under construction", () => {
    expect(requiredFor("retail", "ready")).toEqual(["title_registration", "building_permit", "occupancy", "civil_defence", "commercial_licence"]);
    expect(requiredFor("land", "ready")).toEqual(["title_registration"]);
    expect(requiredFor("office", "under_construction")).toEqual(["title_registration", "building_permit"]);
  });

  it("state by date: expired by date overrides the recorded status; 90 days counts as lapsing; unregistered title needs attention", () => {
    const d = "2026-11-12";
    expect(permitState(null, d)).toMatchObject({ state: "action", reason: "missing" });
    expect(permitState({ kind: "civil_defence", status: "valid", expiresOn: "2026-11-01" }, d)).toMatchObject({ state: "action", reason: "expired", days: -11 });
    expect(permitState({ kind: "civil_defence", status: "valid", expiresOn: "2027-02-10" }, d)).toMatchObject({ state: "expiring", days: 90 });
    expect(permitState({ kind: "civil_defence", status: "valid", expiresOn: "2027-02-11" }, d).state).toBe("ok");
    expect(permitState({ kind: "title_registration", status: "valid", expiresOn: null, form: "primary_contract" }, d)).toMatchObject({ state: "attention", reason: "primary_contract" });
    expect(permitState({ kind: "occupancy", status: "pending", expiresOn: null }, d).state).toBe("pending");
    expect(permitState({ kind: "occupancy", status: "refused", expiresOn: null }, d).state).toBe("action");
  });

  it("an asset is as good as its worst required permit", () => {
    expect(assetCompliance(["a", "b"], { a: "ok", b: "attention" })).toEqual({ state: "attention", score: 1, good: 2, required: 2 });
    expect(assetCompliance(["a", "b", "c"], { a: "ok", b: "expiring" })).toMatchObject({ state: "action", good: 1 });
  });
});

describe("the permit register", () => {
  it("every asset has its required permits seeded, with the deliberate exceptions", async () => {
    const r = (await permitRegister(inv))!;
    expect(r.rows.length).toBe(30);
    for (const row of r.rows) expect(row.items.filter((i) => i.required).every((i) => i.permit)).toBe(true);
    const reasons = r.rows.flatMap((x) => x.items.map((i) => i.state.reason));
    for (const x of ["expired", "expiring", "refused", "pending", "primary_contract"]) expect(reasons).toContain(x);
    expect(r.rows.some((x) => x.items.some((i) => i.kind === "reconciliation" && !i.required))).toBe(true);
    expect(r.rows.some((x) => x.history.length > 0)).toBe(true);
    expect(r.totals.action).toBe(2); // the lapsed civil defence approval and the refused occupancy certificate
    expect(r.queue.length).toBe(r.totals.unverified);
    expect(await permitRegister(adm)).toBeNull();
  });

  it("investors and analysts read; admins cannot", async () => {
    expect((await assetPermits(an, "A-001"))!.asset.id).toBe("A-001");
    expect(await assetPermits(adm, "A-001")).toBeNull();
    expect(await assetPermits(inv, "A-999")).toBeNull();
  });
});

describe("recording and checking", () => {
  it("only managers record; dates must make sense", async () => {
    const ok = { assetId: "A-001", kind: "building_permit", status: "valid", issuedOn: "2017-04-01" };
    expect(await recordPermit(inv, ok)).toEqual({ ok: false, error: "forbidden" });
    expect(await recordPermit(an, ok)).toEqual({ ok: false, error: "forbidden" });
    expect(await recordPermit(m1, { ...ok, issuedOn: "" })).toEqual({ ok: false, error: "invalid" });
    expect(await recordPermit(m1, { ...ok, issuedOn: "2030-01-01" })).toEqual({ ok: false, error: "invalid" });
    expect(await recordPermit(m1, { ...ok, expiresOn: "2016-01-01" })).toEqual({ ok: false, error: "invalid" });
    expect(await recordPermit(m1, { ...ok, form: "registered" })).toEqual({ ok: false, error: "invalid" });
    expect(await recordPermit(m1, { assetId: "A-001", kind: "occupancy", status: "pending" })).toEqual({ ok: false, error: "invalid" });
    expect(await recordPermit(m1, { ...ok, documentId: "D-999999" })).toEqual({ ok: false, error: "invalid" });
  });

  it("registering a title supersedes the old entry, keeps history, and asks an analyst to check", async () => {
    const reg = (await permitRegister(m1))!;
    const row = reg.rows.find((r) => r.items.some((i) => i.permit?.form === "primary_contract"))!;
    const old = row.items.find((i) => i.kind === "title_registration")!.permit!;
    const r = await recordPermit(m1, { assetId: row.asset.id, kind: "title_registration", status: "valid", form: "registered", authority: "Real Estate Publicity Department (sample)", reference: "REG-1", issuedOn: DEMO_TODAY, note: "Registered at last." });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = (await assetPermits(m1, row.asset.id))!;
    const now = after.items.find((i) => i.kind === "title_registration")!;
    expect(now.permit).toMatchObject({ id: r.id, form: "registered", verification: "unverified" });
    expect(now.state.state).toBe("ok");
    expect(after.history.map((h) => h.id)).toContain(old.id);
    const n = await listNotifications(an, "en");
    expect(n.find((x) => x.kind === "permit_to_verify")!.title).toBe(`Permit ${r.id} for ${row.asset.id} needs checking`);

    // Four eyes: the analyst checks it; a manager cannot; an old row is closed.
    expect(await reviewPermit(m1, r.id, { verdict: "verified" })).toEqual({ ok: false, error: "forbidden" });
    expect(await reviewPermit(an, old.id, { verdict: "verified" })).toEqual({ ok: false, error: "closed" });
    expect(await reviewPermit(an, r.id, { verdict: "disputed", note: "no" })).toEqual({ ok: false, error: "invalid" });
    expect(await reviewPermit(an, r.id, { verdict: "disputed", note: "Reference does not match the deed." })).toMatchObject({ ok: true });
    expect((await listNotifications(m1, "en")).find((x) => x.kind === "permit_disputed")!.title).toBe(`Permit ${r.id} for ${row.asset.id} was disputed`);
  });

  it("row-level security: investors cannot write; nothing is deleted", async () => {
    await expect(withSession({ userId: inv.id, role: "investor" }, (tx) => tx.update(permits).set({ status: "valid" }).where(eq(permits.id, "PM-001")))).resolves.toBeDefined();
    const [p] = await withSession({ userId: m1.id, role: "manager" }, (tx) => tx.select().from(permits).where(eq(permits.id, "PM-001")));
    expect(p).toBeDefined();
    await expect(withSession({ userId: m1.id, role: "manager" }, (tx) => tx.delete(permits).where(eq(permits.id, "PM-001")))).rejects.toThrow();
    await expect(withSession({ userId: inv.id, role: "investor" }, (tx) => tx.insert(permits).values({ ...p, id: "PM-900" }))).rejects.toThrow();
  });
});

describe("reminders", () => {
  it("managers are reminded once about lapsing and lapsed permits", async () => {
    const first = await permitReminders(DEMO_TODAY);
    expect(first.length).toBeGreaterThanOrEqual(2);
    expect(await permitReminders(DEMO_TODAY)).toEqual([]);
    const n = (await listNotifications(m1, "en")).filter((x) => x.kind === "permit_expiring");
    expect(n.length).toBe(first.length);
    expect(n.some((x) => /^Commercial licence for A-\d{3} lapses in 38 days$/.test(x.title))).toBe(true);
  });
});
