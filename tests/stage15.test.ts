import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "15.1.1.1" }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { eq } from "drizzle-orm";
import { getDb, withSession } from "../src/db/client";
import { outbox, users } from "../src/db/schema";
import { getMe, inviteUser, landingFor, listUsers, savePrefs, setUserRole, setUserStatus, updateProfile } from "../src/lib/users";
import { listNotifications } from "../src/lib/notify";
import { AREA_ACCESS, type Area } from "../src/lib/permissions";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const mgr = U("u-manager-1", "manager"), inv = U("u-investor", "investor"), adm = U("u-admin", "admin");

describe("the user directory", () => {
  it("only the administrator manages people", async () => {
    expect(await listUsers(mgr)).toBeNull();
    const all = (await listUsers(adm))!;
    expect(all.map((u) => u.id)).toEqual(expect.arrayContaining(["u-admin", "u-investor", "u-manager-1", "u-manager-2"]));
    expect(all.every((u) => u.status === "active")).toBe(true);
    expect(await inviteUser(mgr, { name: "Sara", email: "sara@sample.test", role: "manager" })).toEqual({ ok: false, error: "forbidden" });
  });
  it("row-level security: nobody can write a role or a status through the app connection, not even their own", async () => {
    await expect(withSession({ userId: inv.id, role: "investor" }, (tx) => tx.update(users).set({ role: "admin" }).where(eq(users.id, inv.id)))).rejects.toThrow();
    await expect(withSession({ userId: adm.id, role: "admin" }, (tx) => tx.update(users).set({ status: "deactivated" }).where(eq(users.id, "u-manager-2")))).rejects.toThrow();
    // A person can rename themselves, but the same statement cannot touch someone else.
    const r = await withSession({ userId: inv.id, role: "investor" }, (tx) => tx.update(users).set({ title: "x" }).where(eq(users.id, "u-manager-1")).returning({ id: users.id }));
    expect(r).toEqual([]);
  });
});

describe("invitations, roles and status", () => {
  let id = "";
  it("invites someone: an invited account, an email in the outbox, an audit entry", async () => {
    const r = await inviteUser(adm, { name: "Sara Hamdy", nameAr: "سارة حمدي", email: "Sara@Sample.test", role: "manager", title: "Analyst" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    id = r.id;
    const u = (await listUsers(adm))!.find((x) => x.id === id)!;
    expect(u).toMatchObject({ status: "invited", role: "manager", email: "sara@sample.test", invitedBy: "u-admin" });
    expect((await (await getDb()).select().from(outbox).where(eq(outbox.refId, id))).length).toBe(1);
    expect(await inviteUser(adm, { name: "Again", email: "sara@sample.test", role: "investor" })).toEqual({ ok: false, error: "taken" });
  });
  it("changes a role and tells the person; never your own, never the last administrator", async () => {
    expect(await setUserRole(adm, id, "investor")).toMatchObject({ ok: true });
    expect((await listNotifications(U(id, "investor"), "en")).find((n) => n.kind === "role_changed")!.title).toBe("Your role is now investor");
    expect(await setUserRole(adm, adm.id, "manager")).toEqual({ ok: false, error: "self" });
    expect(await setUserRole(adm, id, "superuser")).toEqual({ ok: false, error: "invalid" });
    expect(await setUserRole(mgr, id, "manager")).toEqual({ ok: false, error: "forbidden" });
  });
  it("keeps one active administrator", async () => {
    expect(await setUserRole(adm, id, "admin")).toMatchObject({ ok: true });
    const second = U(id, "admin");
    // An invited administrator is not active yet, so u-admin is still the last one.
    expect(await setUserStatus(second, adm.id, "deactivated")).toEqual({ ok: false, error: "last_admin" });
    expect(await setUserStatus(adm, second.id, "active")).toMatchObject({ ok: true });
    expect(await setUserStatus(second, adm.id, "deactivated")).toMatchObject({ ok: true });
    expect(await setUserStatus(second, second.id, "deactivated")).toEqual({ ok: false, error: "self" });
    expect(await setUserRole(second, adm.id, "investor")).toMatchObject({ ok: true }); // a deactivated admin is not counted
    expect(await setUserRole(second, adm.id, "admin")).toMatchObject({ ok: true });
    expect(await setUserStatus(second, adm.id, "active")).toMatchObject({ ok: true });
    expect(await setUserStatus(adm, second.id, "deactivated")).toMatchObject({ ok: true });
    const admins = (await listUsers(adm))!.filter((u) => u.role === "admin" && u.status === "active");
    expect(admins.map((u) => u.id)).toEqual(["u-admin"]);
  });
});

describe("profile and preferences", () => {
  it("you change your own name and title; preferences are saved", async () => {
    expect(await updateProfile(mgr, { name: "Nour Abdelrahman", nameAr: "نور عبد الرحمن", title: "Head of Asset Management", titleAr: "رئيسة إدارة الأصول" })).toEqual({ ok: true, changed: ["title", "titleAr"] });
    expect((await getMe(mgr))!.title).toBe("Head of Asset Management");
    expect(await updateProfile(mgr, { name: "N", nameAr: "ن", title: "", titleAr: "" })).toEqual({ ok: false, error: "invalid" });
    expect(await savePrefs(mgr, { lang: "ar", currency: "USD", theme: "dark", landing: "deals" })).toMatchObject({ ok: true });
    expect((await getMe(mgr))!.prefs).toEqual({ lang: "ar", currency: "USD", theme: "dark", landing: "deals" });
    expect(await savePrefs(mgr, { lang: "fr", currency: "USD", theme: "dark", landing: "deals" })).toEqual({ ok: false, error: "invalid" });
    await savePrefs(mgr, { lang: "en", currency: "EGP", theme: "system", landing: "overview" });
  });
  it("lands you on your chosen page only if your role may open it", () => {
    const ok = (r: CurrentUser["role"], a: string) => AREA_ACCESS[a as Area]?.includes(r) ?? false;
    expect(landingFor("manager", { landing: "deals" }, ok)).toBe("/deals");
    expect(landingFor("admin", { landing: "deals" }, ok)).toBe("/overview");
    expect(landingFor("investor", {}, ok)).toBe("/overview");
  });
});
