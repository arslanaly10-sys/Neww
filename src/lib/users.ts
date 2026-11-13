import "server-only";
import { randomBytes } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, withSession } from "@/db/client";
import { users } from "@/db/schema";
import { appendAudit } from "./audit";
import { can, ROLES, type Role } from "./permissions";
import { queueEmail } from "./outbox";
import { notify } from "./notify";
import type { CurrentUser } from "./session";

/**
 * Users and settings. Everyone keeps their own profile and preferences. The administrator invites people, changes
 * roles and deactivates accounts; those three run on the privileged connection after the permission check, because
 * row-level security never lets app_user write a role or a status (see rls.sql). Every change is audited, and the
 * person concerned is told.
 */
export const THEMES = ["system", "light", "dark"] as const;
export const LANDINGS = ["overview", "portfolio", "calendar", "deals", "maintenance"] as const;
export interface Prefs { lang?: "en" | "ar"; currency?: "EGP" | "USD"; theme?: (typeof THEMES)[number]; landing?: (typeof LANDINGS)[number] }
export type UserError = "forbidden" | "invalid" | "not_found" | "self" | "last_admin" | "taken";

export interface UserRow { id: string; name: string; nameAr: string; email: string; role: Role; title: string; titleAr: string; status: "invited" | "active" | "deactivated"; prefs: Prefs; invitedBy: string | null; createdAt: string | null; lastSeenAt: string | null }
const shape = (u: typeof users.$inferSelect): UserRow => ({
  id: u.id, name: u.name, nameAr: u.nameAr, email: u.email, role: u.role as Role, title: u.title, titleAr: u.titleAr, status: u.status as UserRow["status"],
  prefs: (u.prefs ?? {}) as Prefs, invitedBy: u.invitedBy, createdAt: u.createdAt?.toISOString() ?? null, lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
});

export async function listUsers(user: CurrentUser) {
  if (!can(user.role, "users.manage")) return null;
  const rows = await withSession({ userId: user.id, role: user.role }, (tx) => tx.select().from(users).orderBy(asc(users.role), asc(users.id)));
  return rows.map(shape);
}
export async function getMe(user: CurrentUser) {
  const [u] = await withSession({ userId: user.id, role: user.role }, (tx) => tx.select().from(users).where(eq(users.id, user.id)));
  return u ? shape(u) : null;
}

const Invite = z.object({
  name: z.string().trim().min(2).max(80), nameAr: z.string().trim().max(80).optional().default(""),
  email: z.string().trim().toLowerCase().email().max(120), role: z.enum(ROLES as [Role, ...Role[]]),
  title: z.string().trim().max(80).optional().default(""), titleAr: z.string().trim().max(80).optional().default(""),
});

/** Invite someone. In this demo they appear on the sign-in page as invited, and their first sign-in activates them. */
export async function inviteUser(admin: CurrentUser, raw: unknown): Promise<{ ok: true; id: string; auditSeq: number } | { ok: false; error: UserError }> {
  if (!can(admin.role, "users.manage")) return { ok: false, error: "forbidden" };
  const p = Invite.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const v = p.data;
  const db = await getDb();
  const all = await db.select({ email: users.email }).from(users);
  if (all.some((x) => x.email.toLowerCase() === v.email)) return { ok: false, error: "taken" };
  const id = `u-${v.email.split("@")[0].replace(/[^a-z0-9]+/g, "-").slice(0, 20)}-${randomBytes(2).toString("hex")}`;
  await db.insert(users).values({ id, name: v.name, nameAr: v.nameAr || v.name, email: v.email, role: v.role, title: v.title, titleAr: v.titleAr || v.title, status: "invited", prefs: {}, invitedBy: admin.id, createdAt: new Date() });
  await queueEmail({ kind: "user_invite", to: v.email, refId: id, subject: "You are invited to ZMNHOOF OS", body: `Hello ${v.name},\n\n${admin.name} has invited you to ZMNHOOF OS as ${v.role}.\n\nمرحبًا ${v.nameAr || v.name}،\nدعاك ${admin.nameAr} إلى ZMNHOOF OS.\n\nZMNHOOF OS (sample data)` }, admin);
  const a = await appendAudit({ actorId: admin.id, actorRole: admin.role, action: "user.invite", entity: "user", entityId: id, detail: { email: v.email, role: v.role } });
  return { ok: true, id, auditSeq: a.seq };
}

async function guard(admin: CurrentUser, id: string) {
  if (!can(admin.role, "users.manage")) return { error: "forbidden" as const };
  if (id === admin.id) return { error: "self" as const };
  const db = await getDb();
  const all = await db.select().from(users);
  const target = all.find((u) => u.id === id);
  if (!target) return { error: "not_found" as const };
  return { db, all, target };
}

/** Change someone's role. Not your own, and never the last active administrator. */
export async function setUserRole(admin: CurrentUser, id: string, role: string): Promise<{ ok: true; auditSeq: number | null } | { ok: false; error: UserError }> {
  if (!(ROLES as string[]).includes(role)) return { ok: false, error: "invalid" };
  const g = await guard(admin, id);
  if ("error" in g) return { ok: false, error: g.error! };
  if (g.target.role === role) return { ok: true, auditSeq: null };
  if (g.target.role === "admin" && g.target.status === "active" && g.all.filter((u) => u.role === "admin" && u.status === "active").length <= 1) return { ok: false, error: "last_admin" };
  await g.db.update(users).set({ role }).where(eq(users.id, id));
  const a = await appendAudit({ actorId: admin.id, actorRole: admin.role, action: "user.role", entity: "user", entityId: id, detail: { from: g.target.role, to: role } });
  await notify({ to: { users: [id] }, kind: "role_changed", params: { role }, link: "/settings#access", actorId: admin.id });
  return { ok: true, auditSeq: a.seq };
}

/** Deactivate or reactivate an account. A deactivated person cannot sign in; their history stays. */
export async function setUserStatus(admin: CurrentUser, id: string, status: string): Promise<{ ok: true; auditSeq: number | null } | { ok: false; error: UserError }> {
  if (status !== "active" && status !== "deactivated") return { ok: false, error: "invalid" };
  const g = await guard(admin, id);
  if ("error" in g) return { ok: false, error: g.error! };
  if (g.target.status === status) return { ok: true, auditSeq: null };
  if (status === "deactivated" && g.target.role === "admin" && g.all.filter((u) => u.role === "admin" && u.status === "active").length <= 1) return { ok: false, error: "last_admin" };
  await g.db.update(users).set({ status }).where(eq(users.id, id));
  const a = await appendAudit({ actorId: admin.id, actorRole: admin.role, action: status === "active" ? "user.activate" : "user.deactivate", entity: "user", entityId: id, detail: { from: g.target.status } });
  return { ok: true, auditSeq: a.seq };
}

const Profile = z.object({ name: z.string().trim().min(2).max(80), nameAr: z.string().trim().min(2).max(80), title: z.string().trim().max(80), titleAr: z.string().trim().max(80) });

/** Change your own name and title (both languages). Runs under row-level security as yourself. */
export async function updateProfile(user: CurrentUser, raw: unknown): Promise<{ ok: true; changed: string[] } | { ok: false; error: UserError }> {
  const p = Profile.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const me = await getMe(user);
  if (!me) return { ok: false, error: "not_found" };
  const changed = (Object.keys(p.data) as (keyof typeof p.data)[]).filter((k) => me[k] !== p.data[k]);
  if (!changed.length) return { ok: true, changed };
  await withSession({ userId: user.id, role: user.role }, (tx) => tx.update(users).set(p.data).where(eq(users.id, user.id)));
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "user.profile", entity: "user", entityId: user.id, detail: { changed } });
  return { ok: true, changed };
}

const PrefsIn = z.object({ lang: z.enum(["en", "ar"]), currency: z.enum(["EGP", "USD"]), theme: z.enum(THEMES), landing: z.enum(LANDINGS) });

/** Save your preferences: language and currency to start in, light or dark, and the page you land on. */
export async function savePrefs(user: CurrentUser, raw: unknown): Promise<{ ok: true; prefs: Prefs } | { ok: false; error: UserError }> {
  const p = PrefsIn.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  await withSession({ userId: user.id, role: user.role }, (tx) => tx.update(users).set({ prefs: p.data }).where(eq(users.id, user.id)));
  return { ok: true, prefs: p.data };
}

/** Where to go after signing in: the chosen landing page if this role may open it, else the overview. */
export function landingFor(role: Role, prefs: Prefs, allowed: (role: Role, area: string) => boolean) {
  const l = prefs.landing;
  return l && allowed(role, l) ? `/${l}` : "/overview";
}
