import "server-only";
import { asc, eq } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { z } from "zod";
import { getDb, withSession } from "@/db/client";
import { assets, calendarEvents, deals, distributions, leases, rentInvoices, reportSchedules, tenants, users, workOrders } from "@/db/schema";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import { appendAudit } from "./audit";
import { can } from "./permissions";
import { DEMO_TODAY } from "./assumptions";
import { nextRun } from "./reports";
import { notify } from "./notify";
import { addDays, monthGrid } from "./calendar-dates";
import type { CurrentUser } from "./session";

/**
 * The calendar. One place for every date that matters: diary events people add (meetings, inspections, viewings,
 * deadlines) and the dates the rest of the app already knows (leases ending, rent falling due, work due, distributions
 * paid, scheduled reports). Derived dates are read live from their own tables under the viewer's row-level security,
 * so an investor never sees rent or a manager-only meeting.
 */
export const EVENT_KINDS = ["meeting", "inspection", "viewing", "deadline", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const SOURCES = ["events", "leases", "rent", "work", "finance", "deals", "reports"] as const;
export type Source = (typeof SOURCES)[number];
/** Which sources each role sees. Rent and report schedules are managers' records. */
export const sourcesFor = (role: CurrentUser["role"]): Source[] => (role === "manager" ? [...SOURCES] : role === "investor" ? ["events", "leases", "work", "finance", "deals"] : []);

export interface CalItem {
  id: string; // CE-001 for a diary event; lease:L-014, rent:2026-11-01, work:WO-003, dist:DS-002, report:RS-001:2026-12-01 for the rest
  source: Source;
  kind: EventKind | "lease_end" | "rent_due" | "work_due" | "distribution_paid" | "deal_close" | "report_run";
  date: string;
  start: string | null;
  end: string | null;
  title: string;
  detail: string;
  assetId: string | null;
  assetName: string | null;
  link: string;
  overdue: boolean;
  invited: boolean; // the viewer is an attendee
  shared: boolean;
}

const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });
const tr = (lang: "en" | "ar") => {
  const t = createTranslator({ locale: lang, messages: (lang === "ar" ? ar : en) as never, namespace: "cal" as never }) as unknown as (k: string, p?: Record<string, string | number>) => string;
  return (k: string, p?: Record<string, string | number>) => { try { return t(k, p); } catch { return k; } };
};
const egp = (n: number, lang: "en" | "ar") => Math.round(n).toLocaleString(lang === "ar" ? "ar-EG" : "en-US");
const order = (a: CalItem, b: CalItem) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? "") || a.title.localeCompare(b.title);

/** Everything on the calendar between two dates (inclusive) that this person may see, in their language. */
export async function getCalendar(user: CurrentUser, lang: "en" | "ar", from: string, to: string, only?: Source[]): Promise<CalItem[] | null> {
  const allowed = sourcesFor(user.role);
  if (!allowed.length) return null;
  const want = (s: Source) => allowed.includes(s) && (!only || only.includes(s));
  const t = tr(lang);
  const inRange = (d: string | null) => !!d && d >= from && d <= to;
  const d = await withSession(sess(user), async (tx) => ({
    assets: await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr }).from(assets),
    events: want("events") ? await tx.select().from(calendarEvents).orderBy(asc(calendarEvents.date)) : [],
    leases: want("leases") ? await tx.select({ id: leases.id, assetId: leases.assetId, endDate: leases.endDate, tenant: tenants.name, tenantAr: tenants.nameAr }).from(leases).innerJoin(tenants, eq(tenants.id, leases.tenantId)) : [],
    rent: want("rent") ? await tx.select({ dueOn: rentInvoices.dueOn, amountEgp: rentInvoices.amountEgp, paidEgp: rentInvoices.paidEgp, status: rentInvoices.status }).from(rentInvoices) : [],
    work: want("work") ? await tx.select({ id: workOrders.id, title: workOrders.title, assetId: workOrders.assetId, dueOn: workOrders.dueOn, status: workOrders.status }).from(workOrders) : [],
    dist: want("finance") ? await tx.select().from(distributions) : [],
    deals: want("deals") ? await tx.select({ id: deals.id, title: deals.title, titleAr: deals.titleAr, stage: deals.stage, expectedClose: deals.expectedClose }).from(deals) : [],
    reports: want("reports") ? await tx.select().from(reportSchedules) : [],
  }));
  const asset = new Map(d.assets.map((a) => [a.id, lang === "ar" ? a.nameAr : a.name]));
  const base = { start: null, end: null, detail: "", assetId: null, assetName: null, overdue: false, invited: false, shared: false };
  const items: CalItem[] = [];

  for (const e of d.events) {
    if (!inRange(e.date)) continue;
    const who = (e.attendees as string[]) ?? [];
    items.push({
      ...base, id: e.id, source: "events", kind: e.kind as EventKind, date: e.date, start: e.startTime, end: e.endTime,
      title: (lang === "ar" && e.titleAr) || e.title, detail: e.location, assetId: e.assetId, assetName: e.assetId ? asset.get(e.assetId) ?? null : null,
      link: `/calendar/${e.id}`, invited: who.includes(user.id), shared: e.shared === 1,
    });
  }
  for (const l of d.leases) {
    if (!inRange(l.endDate)) continue;
    items.push({ ...base, id: `lease:${l.id}`, source: "leases", kind: "lease_end", date: l.endDate, title: t("d_lease_end", { id: l.id, tenant: lang === "ar" ? l.tenantAr : l.tenant }), assetId: l.assetId, assetName: asset.get(l.assetId) ?? null, link: `/leases/${l.id}` });
  }
  // Rent: one entry per due date, for invoices not yet paid in full.
  const rentByDay = new Map<string, { n: number; owed: number }>();
  for (const r of d.rent) {
    if (r.status === "paid" || !inRange(r.dueOn)) continue;
    const x = rentByDay.get(r.dueOn) ?? { n: 0, owed: 0 };
    x.n += 1; x.owed += r.amountEgp - r.paidEgp;
    rentByDay.set(r.dueOn, x);
  }
  for (const [day, x] of rentByDay) items.push({ ...base, id: `rent:${day}`, source: "rent", kind: "rent_due", date: day, title: t("d_rent_due", { n: x.n }), detail: t("d_rent_owed", { amount: egp(x.owed, lang) }), link: "/leases#rent", overdue: day < DEMO_TODAY });
  for (const w of d.work) {
    if (!inRange(w.dueOn) || ["done", "cancelled"].includes(w.status)) continue;
    items.push({ ...base, id: `work:${w.id}`, source: "work", kind: "work_due", date: w.dueOn!, title: t("d_work_due", { id: w.id, title: w.title }), assetId: w.assetId, assetName: w.assetId ? asset.get(w.assetId) ?? null : null, link: `/maintenance/${w.id}`, overdue: w.dueOn! < DEMO_TODAY });
  }
  for (const x of d.dist) {
    if (x.status !== "paid" || !inRange(x.paidOn)) continue;
    items.push({ ...base, id: `dist:${x.id}`, source: "finance", kind: "distribution_paid", date: x.paidOn!, title: t("d_distribution_paid", { id: x.id, period: x.period }), detail: t("d_amount", { amount: egp(x.amountEgp, lang) }), link: "/finance#distributions" });
  }
  for (const x of d.deals) {
    if (!inRange(x.expectedClose) || ["won", "lost"].includes(x.stage)) continue;
    items.push({ ...base, id: `deal:${x.id}`, source: "deals", kind: "deal_close", date: x.expectedClose!, title: t("d_deal_close", { id: x.id, title: (lang === "ar" && x.titleAr) || x.title }), link: `/deals/${x.id}`, overdue: x.expectedClose! < DEMO_TODAY });
  }
  // Report schedules: the next run and the runs after it, as far as the range reaches.
  for (const s of d.reports) {
    if (s.active !== 1) continue;
    let run = s.nextRunOn;
    for (let i = 0; i < 24 && run <= to; i++, run = nextRun(run, s.frequency, s.dayOfMonth)) {
      if (run >= from) items.push({ ...base, id: `report:${s.id}:${run}`, source: "reports", kind: "report_run", date: run, title: t("d_report_run", { name: s.name }), link: "/reports#scheduled" });
    }
  }
  return items.sort(order);
}

/** The diary events in one person's next days, for Horus and the calendar's "coming up" list. */
export async function upcoming(user: CurrentUser, lang: "en" | "ar", days = 14) {
  const items = await getCalendar(user, lang, DEMO_TODAY, addDays(DEMO_TODAY, days));
  return items;
}

/** One diary event with its people, for its own page. */
export async function getEvent(user: CurrentUser, id: string) {
  if (!sourcesFor(user.role).includes("events")) return null;
  const r = await withSession(sess(user), async (tx) => ({
    ev: (await tx.select().from(calendarEvents).where(eq(calendarEvents.id, String(id))))[0],
    people: await tx.select({ id: users.id, name: users.name, nameAr: users.nameAr, role: users.role, title: users.title, titleAr: users.titleAr }).from(users),
    assets: await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr }).from(assets),
  }));
  if (!r.ev) return null;
  const who = (r.ev.attendees as string[]) ?? [];
  return {
    ...r.ev, attendees: who, shared: r.ev.shared === 1,
    people: r.people.filter((p) => who.includes(p.id)),
    creator: r.people.find((p) => p.id === r.ev.createdBy) ?? null,
    asset: r.ev.assetId ? r.assets.find((a) => a.id === r.ev.assetId) ?? null : null,
  };
}

/** Who can be invited (managers and the investor) and which assets an event can be about. */
export async function eventOptions(user: CurrentUser) {
  const r = await withSession(sess(user), async (tx) => ({
    people: await tx.select({ id: users.id, name: users.name, nameAr: users.nameAr, role: users.role, status: users.status }).from(users),
    assets: await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr }).from(assets).orderBy(asc(assets.id)),
  }));
  return { people: r.people.filter((p) => (p.role === "manager" || p.role === "investor") && p.status !== "deactivated"), assets: r.assets };
}

export type CalendarError = "forbidden" | "invalid" | "not_found" | "past" | "times";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const flag = z.union([z.boolean(), z.literal("on"), z.literal("1"), z.literal(""), z.literal("0")]).optional().transform((v) => v === true || v === "on" || v === "1");
const Event = z.object({
  title: z.string().trim().min(3).max(120),
  titleAr: z.string().trim().max(120).optional().default(""),
  kind: z.enum(EVENT_KINDS),
  date: z.string().regex(DATE),
  allDay: flag,
  startTime: z.union([z.literal(""), z.string().regex(TIME)]).optional().default(""),
  endTime: z.union([z.literal(""), z.string().regex(TIME)]).optional().default(""),
  assetId: z.union([z.literal(""), z.string().regex(/^A-\d{3}$/)]).optional().default(""),
  location: z.string().trim().max(160).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
  shared: flag,
  attendees: z.array(z.string().max(40)).max(12).optional().default([]),
});
type EventInput = z.infer<typeof Event>;

const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
/** Two timed events on the same day overlap; an all-day event (a deadline) never clashes. An event with no end lasts an hour. */
export function overlaps(a: { date: string; start: string | null; end: string | null }, b: { date: string; start: string | null; end: string | null }) {
  if (a.date !== b.date || !a.start || !b.start) return false;
  const [as, bs] = [toMin(a.start), toMin(b.start)];
  const [ae, be] = [a.end ? toMin(a.end) : as + 60, b.end ? toMin(b.end) : bs + 60];
  return as < be && bs < ae;
}

async function check(user: CurrentUser, v: EventInput) {
  if (v.date < "2025-01-01" || v.date > "2028-12-31") return "invalid" as const;
  if (!v.allDay && !v.startTime) return "times" as const;
  if (!v.allDay && v.endTime && toMin(v.endTime) <= toMin(v.startTime)) return "times" as const;
  const opts = await eventOptions(user);
  if (v.attendees.some((a) => !opts.people.some((p) => p.id === a))) return "invalid" as const;
  if (v.assetId && !opts.assets.some((a) => a.id === v.assetId)) return "invalid" as const;
  return null;
}
const row = (v: EventInput) => ({
  title: v.title, titleAr: v.titleAr || null, kind: v.kind, date: v.date, startTime: v.allDay ? null : v.startTime, endTime: v.allDay || !v.endTime ? null : v.endTime,
  assetId: v.assetId || null, location: v.location, notes: v.notes, shared: v.shared ? 1 : 0, attendees: [...new Set(v.attendees)],
});

/** Other events on the same day, sharing at least one person, whose times overlap this one's. Reported, not blocked. */
async function clashesFor(user: CurrentUser, id: string | null, r: ReturnType<typeof row>) {
  if (!r.startTime || !r.attendees.length) return [];
  const same = await withSession(sess(user), (tx) => tx.select().from(calendarEvents).where(eq(calendarEvents.date, r.date)));
  return same
    .filter((e) => e.id !== id && ((e.attendees as string[]) ?? []).some((a) => r.attendees.includes(a)) && overlaps({ date: r.date, start: r.startTime, end: r.endTime }, { date: e.date, start: e.startTime, end: e.endTime }))
    .map((e) => ({ id: e.id, title: e.title, titleAr: e.titleAr, start: e.startTime }));
}

const whenOf = (r: { date: string; startTime: string | null }) => (r.startTime ? `${r.date} ${r.startTime}` : r.date);

/** Put an event in the diary. Managers only. Invited people are told (in the app, and by email if they chose). */
export async function createEvent(user: CurrentUser, raw: unknown): Promise<{ ok: true; id: string; auditSeq: number; clashes: Awaited<ReturnType<typeof clashesFor>> } | { ok: false; error: CalendarError }> {
  if (!can(user.role, "calendar.manage")) return { ok: false, error: "forbidden" };
  const p = Event.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  if (p.data.date < DEMO_TODAY) return { ok: false, error: "past" };
  const bad = await check(user, p.data);
  if (bad) return { ok: false, error: bad };
  const r = row(p.data);
  const ids = await (await getDb()).select({ id: calendarEvents.id }).from(calendarEvents);
  const id = `CE-${String(Math.max(0, ...ids.map((x) => Number(x.id.slice(3)) || 0)) + 1).padStart(3, "0")}`;
  const now = new Date();
  const clashes = await clashesFor(user, null, r);
  await withSession(sess(user), (tx) => tx.insert(calendarEvents).values({ id, ...r, createdBy: user.id, createdAt: now, updatedAt: now }));
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "calendar.create", entity: "calendar_event", entityId: id, detail: { title: r.title, kind: r.kind, date: r.date, start: r.startTime, attendees: r.attendees, shared: r.shared === 1 } });
  await notify({ to: { users: r.attendees }, kind: "event_invited", params: { title: r.title, when: whenOf(r) }, link: `/calendar/${id}`, actorId: user.id });
  return { ok: true, id, auditSeq: ev.seq, clashes };
}

/** Change an event. Everyone invited before or after hears about a new date or time; newly invited people get an invitation. */
export async function updateEvent(user: CurrentUser, id: string, raw: unknown): Promise<{ ok: true; changed: string[]; auditSeq: number | null; clashes: Awaited<ReturnType<typeof clashesFor>> } | { ok: false; error: CalendarError }> {
  if (!can(user.role, "calendar.manage")) return { ok: false, error: "forbidden" };
  const p = Event.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const cur = await getEvent(user, id);
  if (!cur) return { ok: false, error: "not_found" };
  if (p.data.date !== cur.date && p.data.date < DEMO_TODAY) return { ok: false, error: "past" };
  const bad = await check(user, p.data);
  if (bad) return { ok: false, error: bad };
  const r = row(p.data);
  const fields = ["title", "titleAr", "kind", "date", "startTime", "endTime", "assetId", "location", "notes", "shared"] as const;
  const before: Record<string, unknown> = { ...cur, shared: cur.shared ? 1 : 0 };
  const changed: string[] = fields.filter((f) => (before[f] ?? null) !== (r[f] ?? null));
  const added = r.attendees.filter((a) => !cur.attendees.includes(a));
  const removed = cur.attendees.filter((a) => !r.attendees.includes(a));
  if (added.length || removed.length) changed.push("attendees");
  if (!changed.length) return { ok: true, changed, auditSeq: null, clashes: [] };
  const clashes = await clashesFor(user, cur.id, r);
  await withSession(sess(user), (tx) => tx.update(calendarEvents).set({ ...r, updatedAt: new Date() }).where(eq(calendarEvents.id, cur.id)));
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "calendar.update", entity: "calendar_event", entityId: cur.id, detail: { changed, date: r.date, start: r.startTime, added, removed } });
  const moved = changed.some((c) => ["date", "startTime", "endTime"].includes(c));
  if (moved) await notify({ to: { users: [...new Set([...cur.attendees.filter((a) => r.attendees.includes(a))])] }, kind: "event_changed", params: { title: r.title, when: whenOf(r) }, link: `/calendar/${cur.id}`, actorId: user.id });
  if (added.length) await notify({ to: { users: added }, kind: "event_invited", params: { title: r.title, when: whenOf(r) }, link: `/calendar/${cur.id}`, actorId: user.id });
  if (removed.length) await notify({ to: { users: removed }, kind: "event_cancelled", params: { title: cur.title, when: whenOf(cur) }, link: null, actorId: user.id });
  return { ok: true, changed, auditSeq: ev.seq, clashes };
}

/** Take an event out of the diary. The audit trail keeps what it was; invited people are told it is off. */
export async function deleteEvent(user: CurrentUser, id: string): Promise<{ ok: true; auditSeq: number } | { ok: false; error: CalendarError }> {
  if (!can(user.role, "calendar.manage")) return { ok: false, error: "forbidden" };
  const cur = await getEvent(user, id);
  if (!cur) return { ok: false, error: "not_found" };
  await withSession(sess(user), (tx) => tx.delete(calendarEvents).where(eq(calendarEvents.id, cur.id)));
  const ev = await appendAudit({ actorId: user.id, actorRole: user.role, action: "calendar.delete", entity: "calendar_event", entityId: cur.id, detail: { title: cur.title, date: cur.date, start: cur.startTime, attendees: cur.attendees } });
  await notify({ to: { users: cur.attendees }, kind: "event_cancelled", params: { title: cur.title, when: whenOf(cur) }, link: null, actorId: user.id });
  return { ok: true, auditSeq: ev.seq };
}

/** The month on screen: its grid of whole weeks and everything in it. */
export async function getMonth(user: CurrentUser, lang: "en" | "ar", month: string, only?: Source[]) {
  const g = monthGrid(month);
  const items = await getCalendar(user, lang, g.from, g.to, only);
  return items ? { ...g, items } : null;
}
