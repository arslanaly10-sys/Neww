"use server";
import { cookies } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { CURRENCY_COOKIE, clearSessionCookie, getCurrentUser, setSessionCookie } from "@/lib/session";
import { appendAudit } from "@/lib/audit";

async function userById(id: string) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u;
}

export async function signIn(userId: string, locale: string) {
  const u = await userById(userId);
  if (!u) throw new Error("Unknown demo user");
  await setSessionCookie(u.id);
  await appendAudit({ actorId: u.id, actorRole: u.role, action: "session.start", entity: "user", entityId: u.id, detail: { demo: true } });
  redirect({ href: "/overview", locale });
}

/** Role switcher: moves to another sample user. Recorded in the audit chain. */
export async function switchUser(userId: string, locale: string) {
  const from = await getCurrentUser();
  const u = await userById(userId);
  if (!u) throw new Error("Unknown demo user");
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
