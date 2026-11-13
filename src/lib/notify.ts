import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { z } from "zod";
import { getDb, withSession } from "@/db/client";
import { notificationPrefs, notifications, outbox, users } from "@/db/schema";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import type { Role } from "./permissions";
import type { CurrentUser } from "./session";

/**
 * Notifications. Services call notify() when something happens that a person should know: an approval waiting for
 * them, a decision on what they proposed, work assigned to them, a paid distribution, a new demo request, a report
 * ready. Each person chooses per category whether to hear about it in the app, by email (the outbox here), or both.
 * The text is stored as a kind and its parameters and rendered in the reader's language.
 */
export const N_CATEGORIES = ["approvals", "work", "finance", "leasing", "reports", "sales"] as const;
export type NCategory = (typeof N_CATEGORIES)[number];
export const KINDS = {
  approval_request: "approvals", approval_decided: "approvals",
  work_assigned: "work", work_reported: "work", work_completed: "work",
  distribution_paid: "finance", ledger_large: "finance",
  rent_overdue: "leasing", renewal_due: "leasing",
  report_ready: "reports", lead_new: "sales",
} as const satisfies Record<string, NCategory>;
export type NKind = keyof typeof KINDS;
/** Defaults when a person has not chosen: everything in the app, approvals also by email. */
export const DEFAULT_PREFS: Record<NCategory, { inApp: boolean; email: boolean }> = {
  approvals: { inApp: true, email: true }, work: { inApp: true, email: false }, finance: { inApp: true, email: false },
  leasing: { inApp: true, email: false }, reports: { inApp: true, email: false }, sales: { inApp: true, email: false },
};
export type Params = Record<string, string | number>;

const tr = (lang: "en" | "ar") => {
  const t = createTranslator({ locale: lang, messages: (lang === "ar" ? ar : en) as never, namespace: "ntf" as never }) as unknown as (k: string, p?: Params) => string;
  return (k: string, p?: Params) => { try { return t(k, p); } catch { return k; } };
};
/** The notification's sentence in a language: its title and, when the kind has one, a line of detail. */
export function renderNotification(kind: string, params: Params, lang: "en" | "ar") {
  const t = tr(lang);
  const body = t(`b_${kind}`, params);
  // A kind without a detail line comes back as its own key; show nothing then.
  return { title: t(`k_${kind}`, params), body: body.endsWith(`b_${kind}`) ? "" : body };
}

async function prefsFor(userIds: string[]) {
  const db = await getDb();
  const rows = userIds.length ? await db.select().from(notificationPrefs).where(inArray(notificationPrefs.userId, userIds)) : [];
  return (userId: string, cat: NCategory) => {
    const r = rows.find((x) => x.userId === userId && x.category === cat);
    return r ? { inApp: r.inApp === 1, email: r.email === 1 } : DEFAULT_PREFS[cat];
  };
}

/**
 * Tell people about something. `to` is user ids or roles; the person who caused it is never notified about their own
 * act. Runs on the privileged connection because it writes for other people; reading stays limited to each owner.
 */
export async function notify(o: { to: { users?: string[]; roles?: Role[] }; kind: NKind; params?: Params; link?: string | null; actorId?: string | null; at?: Date }) {
  const db = await getDb();
  const everyone = await db.select({ id: users.id, role: users.role, email: users.email }).from(users);
  const ids = new Set<string>(o.to.users ?? []);
  everyone.filter((u) => (o.to.roles ?? []).includes(u.role as Role)).forEach((u) => ids.add(u.id));
  if (o.actorId) ids.delete(o.actorId);
  const targets = everyone.filter((u) => ids.has(u.id));
  if (!targets.length) return 0;
  const cat = KINDS[o.kind];
  const pref = await prefsFor(targets.map((u) => u.id));
  const params = o.params ?? {};
  const now = o.at ?? new Date();
  const inApp = targets.filter((u) => pref(u.id, cat).inApp);
  if (inApp.length) await db.insert(notifications).values(inApp.map((u) => ({ id: `N-${randomBytes(5).toString("hex")}`, userId: u.id, kind: o.kind, category: cat, params, link: o.link ?? null, actorId: o.actorId ?? null, createdAt: now })));
  const byEmail = targets.filter((u) => pref(u.id, cat).email);
  if (byEmail.length) {
    const e = renderNotification(o.kind, params, "en"), a = renderNotification(o.kind, params, "ar");
    await db.insert(outbox).values(byEmail.map((u) => ({
      id: `M-${randomBytes(5).toString("hex")}`, kind: `notify_${o.kind}`, to: u.email, subject: e.title.slice(0, 200),
      body: [e.title, e.body, "", a.title, a.body, "", "ZMNHOOF OS (sample data)"].filter((x, i, arr) => x || arr[i - 1]).join("\n"), refId: o.link ?? null, createdBy: "system", createdAt: now,
    })));
  }
  return inApp.length + byEmail.length;
}

export interface NotificationView { id: string; kind: string; category: string; title: string; body: string; link: string | null; createdAt: string; read: boolean }

export async function listNotifications(user: CurrentUser, lang: "en" | "ar", opts: { limit?: number; unreadOnly?: boolean; category?: string } = {}) {
  const rows = await withSession({ userId: user.id, role: user.role }, (tx) => {
    const conds = [eq(notifications.userId, user.id)];
    if (opts.unreadOnly) conds.push(isNull(notifications.readAt));
    if (opts.category && (N_CATEGORIES as readonly string[]).includes(opts.category)) conds.push(eq(notifications.category, opts.category));
    return tx.select().from(notifications).where(and(...conds)).orderBy(desc(notifications.createdAt)).limit(opts.limit ?? 100);
  });
  return rows.map((r): NotificationView => ({ id: r.id, kind: r.kind, category: r.category, ...renderNotification(r.kind, r.params as Params, lang), link: r.link, createdAt: r.createdAt.toISOString(), read: !!r.readAt }));
}

export async function unreadCount(user: CurrentUser) {
  const rows = await withSession({ userId: user.id, role: user.role }, (tx) => tx.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))));
  return rows.length;
}

/** Mark some notifications read, or all of them. Only the reader's own rows are touched (row-level security). */
export async function markRead(user: CurrentUser, ids: string[] | "all") {
  const now = new Date();
  return withSession({ userId: user.id, role: user.role }, async (tx) => {
    const where = ids === "all" ? and(eq(notifications.userId, user.id), isNull(notifications.readAt)) : and(eq(notifications.userId, user.id), inArray(notifications.id, ids.length ? ids.slice(0, 200) : ["-"]));
    const r = await tx.update(notifications).set({ readAt: now }).where(where).returning({ id: notifications.id });
    return r.length;
  });
}

export async function getPrefs(user: CurrentUser) {
  const pref = await prefsFor([user.id]);
  return N_CATEGORIES.map((c) => ({ category: c, ...pref(user.id, c) }));
}

const Prefs = z.array(z.object({ category: z.enum(N_CATEGORIES), inApp: z.boolean(), email: z.boolean() })).max(N_CATEGORIES.length);
export async function setPrefs(user: CurrentUser, raw: unknown): Promise<{ ok: true } | { ok: false; error: "invalid" }> {
  const p = Prefs.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  await withSession({ userId: user.id, role: user.role }, async (tx) => {
    for (const x of p.data) {
      await tx.insert(notificationPrefs).values({ userId: user.id, category: x.category, inApp: x.inApp ? 1 : 0, email: x.email ? 1 : 0 })
        .onConflictDoUpdate({ target: [notificationPrefs.userId, notificationPrefs.category], set: { inApp: x.inApp ? 1 : 0, email: x.email ? 1 : 0 } });
    }
  });
  return { ok: true };
}
