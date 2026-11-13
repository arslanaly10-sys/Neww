"use server";
import { cookies } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { CURRENCY_COOKIE, clearSessionCookie, getCurrentUser, setSessionCookie } from "@/lib/session";
import { appendAudit } from "@/lib/audit";
import { landingFor, type Prefs } from "@/lib/users";
import { AREA_ACCESS, AREAS, type Area, type Role } from "@/lib/permissions";

const THEME_COOKIE = "zos_theme";

async function userById(id: string) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u;
}

/**
 * Sign in as a sample user. A deactivated account cannot; an invited one becomes active on its first sign-in. The
 * person's saved preferences decide the language, currency, theme and first page.
 */
export async function signIn(userId: string, locale: string) {
  const u = await userById(userId);
  if (!u) throw new Error("Unknown demo user");
  if (u.status === "deactivated") throw new Error("This account is deactivated");
  const db = await getDb();
  const first = u.status === "invited";
  await db.update(users).set({ lastSeenAt: new Date(), ...(first ? { status: "active" } : {}) }).where(eq(users.id, u.id));
  await setSessionCookie(u.id);
  await appendAudit({ actorId: u.id, actorRole: u.role, action: "session.start", entity: "user", entityId: u.id, detail: { demo: true, ...(first ? { firstSignIn: true } : {}) } });
  const prefs = (u.prefs ?? {}) as Prefs;
  const jar = await cookies();
  if (prefs.currency) jar.set(CURRENCY_COOKIE, prefs.currency, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  if (prefs.theme && prefs.theme !== "system") jar.set(THEME_COOKIE, prefs.theme, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  else if (prefs.theme === "system") jar.delete(THEME_COOKIE);
  redirect({ href: landingFor(u.role as Role, prefs, (r, a) => (AREAS as readonly string[]).includes(a) && AREA_ACCESS[a as Area].includes(r)), locale: prefs.lang ?? locale });
}

/** Role switcher: moves to another sample user. Recorded in the audit chain. */
export async function switchUser(userId: string, locale: string) {
  const from = await getCurrentUser();
  const u = await userById(userId);
  if (!u) throw new Error("Unknown demo user");
  if (u.status === "deactivated") throw new Error("This account is deactivated");
  await setSessionCookie(u.id);
  await appendAudit({
    actorId: u.id, actorRole: u.role, action: "role.switch", entity: "user", entityId: u.id,
    detail: { from: from ? { id: from.id, role: from.role } : null, to: { id: u.id, role: u.role }, demo: true },
  });
  redirect({ href: u.role === "admin" ? "/governance" : "/overview", locale });
}

export async function signOut(locale: string) {
  const u = await getCurrentUser();
  if (u) await appendAudit({ actorId: u.id, actorRole: u.role, action: "session.end", entity: "user", entityId: u.id });
  await clearSessionCookie();
  redirect({ href: "/", locale });
}

export async function setCurrency(cur: "EGP" | "USD") {
  (await cookies()).set(CURRENCY_COOKIE, cur, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
}

/** Light, dark or the system's choice: a cookie read before the first paint (see the root layout). */
export async function setTheme(theme: "system" | "light" | "dark") {
  const jar = await cookies();
  if (theme === "system") jar.delete(THEME_COOKIE);
  else jar.set(THEME_COOKIE, theme === "dark" ? "dark" : "light", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}
