import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { withSession, getDb, type Session } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Role } from "./permissions";

/**
 * Demo session: a signed, httpOnly cookie that names one of four sample users.
 * This is NOT authentication. Production would use SSO/OIDC (see docs/architecture.md).
 */
const SECRET = process.env.SESSION_SECRET ?? "zmnhoof-os-demo-secret-not-for-production";
const sign = (v: string) => createHmac("sha256", SECRET).update(v).digest("hex").slice(0, 32);

export const SESSION_COOKIE = "zos_session";
export const CURRENCY_COOKIE = "zos_currency";

export async function setSessionCookie(userId: string) {
  (await cookies()).set(SESSION_COOKIE, `${userId}.${sign(userId)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8,
  });
}
export async function clearSessionCookie() { (await cookies()).delete(SESSION_COOKIE); }

export interface CurrentUser { id: string; name: string; nameAr: string; role: Role; title: string; titleAr: string }

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [id, sig] = raw.split(".");
  if (!id || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(id));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u && u.status !== "deactivated" ? { id: u.id, name: u.name, nameAr: u.nameAr, role: u.role as Role, title: u.title, titleAr: u.titleAr } : null;
}

export async function getCurrency(): Promise<"EGP" | "USD"> {
  return (await cookies()).get(CURRENCY_COOKIE)?.value === "USD" ? "USD" : "EGP";
}

export const toSession = (u: CurrentUser): Session => ({ userId: u.id, role: u.role });
export { withSession };
