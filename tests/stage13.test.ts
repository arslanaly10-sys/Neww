import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "13.1.1.1" }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { withSession } from "../src/db/client";
import { calendarEvents } from "../src/db/schema";
import { createEvent, deleteEvent, getCalendar, getEvent, getMonth, overlaps, updateEvent } from "../src/lib/calendar";
import { monthGrid, isWeekend } from "../src/lib/calendar-dates";
import { fold, icsText, toIcs } from "../src/lib/ics";
import { listNotifications } from "../src/lib/notify";
import { classify } from "../src/lib/horus/scripted";
import { runTool } from "../src/lib/horus/tools";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const mgr = U("u-manager-1", "manager"), mgr2 = U("u-manager-2", "manager"), inv = U("u-investor", "investor"), adm = U("u-admin", "admin");
const base = { kind: "meeting", titleAr: "", assetId: "", location: "Office", notes: "", allDay: "", endTime: "" };

describe("dates", () => {
  it("lays a month out in whole weeks that start on Sunday", () => {
    const g = monthGrid("2026-11");
    expect([g.from, g.to, g.weeks.length]).toEqual(["2026-11-01", "2026-12-05", 5]);
    expect(monthGrid("2027-02").from).toBe("2027-01-31");
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
    expect([isWeekend("2026-11-13"), isWeekend("2026-11-14"), isWeekend("2026-11-15")]).toEqual([true, true, false]);
  });
  it("finds overlapping times on the same day; all-day events never clash", () => {
    expect(overlaps({ date: "2026-11-19", start: "10:00", end: "11:00" }, { date: "2026-11-19", start: "10:30", end: null })).toBe(true);
    expect(overlaps({ date: "2026-11-19", start: "10:00", end: "11:00" }, { date: "2026-11-19", start: "11:00", end: "12:00" })).toBe(false);
    expect(overlaps({ date: "2026-11-19", start: null, end: null }, { date: "2026-11-19", start: "10:00", end: null })).toBe(false);
    expect(overlaps({ date: "2026-11-19", start: "10:00", end: null }, { date: "2026-11-20", start: "10:00", end: null })).toBe(false);
  });
});

describe("what each role sees", () => {
  it("managers see diary events and every derived date, rent and reports included", async () => {
    const m = (await getMonth(mgr, "en", "2026-11"))!;
    const src = new Set(m.items.map((i) => i.source));
    for (const s of ["events", "rent", "reports"]) expect(src.has(s as never), s).toBe(true);
    expect(m.items.find((i) => i.id === "CE-002")).toMatchObject({ date: "2026-11-12", start: "10:00", title: "Weekly portfolio review", invited: true });
    expect(m.items.some((i) => i.source === "rent" && /rent invoices? due/.test(i.title))).toBe(true);
    expect(m.items.map((i) => i.date)).toEqual([...m.items.map((i) => i.date)].sort());
    const year = (await getCalendar(mgr, "en", "2026-01-01", "2027-12-31"))!;
    expect(year.some((i) => i.source === "leases")).toBe(true);
    expect(year.some((i) => i.source === "finance")).toBe(true);
  });
  it("investors see shared events and their invitations only, never rent or report schedules", async () => {
    const all = (await getCalendar(inv, "en", "2026-10-01", "2026-12-31"))!;
    const ids = all.filter((i) => i.source === "events").map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["CE-004", "CE-009"]));
    expect(ids).not.toContain("CE-002");
    expect(all.some((i) => i.source === "rent" || i.source === "reports")).toBe(false);
    // Row-level security holds even when asked directly.
    const rows = await withSession({ userId: inv.id, role: "investor" }, (tx) => tx.select().from(calendarEvents));
    expect(rows.every((r) => r.shared === 1 || (r.attendees as string[]).includes(inv.id))).toBe(true);
    expect(await getEvent(inv, "CE-003")).toBeNull();
    expect(await getCalendar(adm, "en", "2026-11-01", "2026-11-30")).toBeNull();
  });
  it("speaks Arabic: event titles and derived dates", async () => {
    const m = (await getMonth(mgr, "ar", "2026-11"))!;
    expect(m.items.find((i) => i.id === "CE-002")!.title).toBe("المراجعة الأسبوعية للمحفظة");
    expect(m.items.find((i) => i.source === "rent")!.title).toMatch(/إيجار/);
  });
});

describe("adding, changing and cancelling events", () => {
  it("only managers add events; dates and times are checked", async () => {
    expect(await createEvent(inv, { ...base, title: "Coffee", date: "2026-11-20", startTime: "10:00", attendees: [] })).toEqual({ ok: false, error: "forbidden" });
    expect(await createEvent(mgr, { ...base, title: "Too late", date: "2026-11-01", startTime: "10:00", attendees: [] })).toEqual({ ok: false, error: "past" });
    expect(await createEvent(mgr, { ...base, title: "No time", date: "2026-11-20", startTime: "", attendees: [] })).toEqual({ ok: false, error: "times" });
    expect(await createEvent(mgr, { ...base, title: "Backwards", date: "2026-11-20", startTime: "12:00", endTime: "11:00", attendees: [] })).toEqual({ ok: false, error: "times" });
    expect(await createEvent(mgr, { ...base, title: "Stranger", date: "2026-11-20", startTime: "12:00", attendees: ["u-admin"] })).toEqual({ ok: false, error: "invalid" });
  });

  let id = "";
  it("invites people, warns about clashes, and audits", async () => {
    const r = await createEvent(mgr, { ...base, title: "Contractor walk-through", date: "2026-11-19", startTime: "10:30", endTime: "11:30", assetId: "A-008", shared: "on", attendees: ["u-manager-1", "u-manager-2", "u-investor"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    id = r.id;
    expect(id).toMatch(/^CE-\d{3}$/);
    expect(r.clashes.map((c) => c.id)).toContain("CE-006"); // the weekly review, 10:00 to 11:00, same people
    expect(r.auditSeq).toBeGreaterThan(0);
    const e = (await getEvent(inv, id))!;
    expect(e).toMatchObject({ shared: true, assetId: "A-008", startTime: "10:30" });
    expect((await listNotifications(mgr2, "en")).find((n) => n.kind === "event_invited" && n.link === `/calendar/${id}`)!.title).toBe("You are invited: Contractor walk-through");
    expect((await listNotifications(inv, "en")).some((n) => n.kind === "event_invited")).toBe(true);
    expect((await listNotifications(mgr, "en")).some((n) => n.kind === "event_invited" && n.link === `/calendar/${id}`)).toBe(false); // not the organiser
  });

  it("moving an event tells the people still invited; removing someone tells them it is off for them", async () => {
    const r = await updateEvent(mgr, id, { ...base, title: "Contractor walk-through", date: "2026-11-23", startTime: "13:00", endTime: "14:00", assetId: "A-008", shared: "on", attendees: ["u-manager-1", "u-manager-2"] });
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.changed).toEqual(expect.arrayContaining(["date", "startTime", "endTime", "attendees"]));
    expect((await listNotifications(mgr2, "en")).find((n) => n.kind === "event_changed")!.body).toBe("Now 2026-11-23 13:00");
    expect((await listNotifications(inv, "en")).find((n) => n.kind === "event_cancelled")!.title).toBe("Cancelled: Contractor walk-through");
    expect(await updateEvent(mgr, id, { ...base, title: "Contractor walk-through", date: "2026-11-23", startTime: "13:00", endTime: "14:00", assetId: "A-008", shared: "on", attendees: ["u-manager-1", "u-manager-2"] })).toMatchObject({ ok: true, changed: [] });
    expect(await updateEvent(inv, id, { ...base, title: "Mine now", date: "2026-11-23", startTime: "13:00", attendees: [] })).toEqual({ ok: false, error: "forbidden" });
  });

  it("cancelling removes it and tells the people invited", async () => {
    expect(await deleteEvent(inv, id)).toEqual({ ok: false, error: "forbidden" });
    expect(await deleteEvent(mgr, id)).toMatchObject({ ok: true });
    expect(await getEvent(mgr, id)).toBeNull();
    expect((await listNotifications(mgr2, "en")).filter((n) => n.kind === "event_cancelled").length).toBeGreaterThanOrEqual(1);
    expect(await deleteEvent(mgr, id)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("calendar files", () => {
  it("escapes text and folds long lines at 75 octets without splitting characters", () => {
    expect(icsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const long = `SUMMARY:${"اجتماع ".repeat(20)}`;
    const lines = fold(long).split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(lines.map((l, i) => (i ? l.slice(1) : l)).join("")).toBe(long);
  });
  it("writes timed events in Cairo time and all-day events as dates", async () => {
    const items = (await getCalendar(mgr, "en", "2026-11-12", "2026-11-25"))!;
    const ics = toIcs(items, { name: "ZMNHOOF calendar", base: "http://x/en", now: new Date("2026-11-12T00:00:00Z") });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)!.length).toBe(items.length);
    expect(ics).toContain("DTSTART;TZID=Africa/Cairo:20261112T100000");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261125");
    expect(ics).toContain("UID:CE-002@zmnhoof.example");
  });
});

describe("Horus", () => {
  it("routes calendar questions to the calendar and keeps lease questions where they were", () => {
    expect(classify("What's on this week?").intent).toBe("calendar");
    expect(classify("Any meetings next week?").intent).toBe("calendar");
    expect(classify("ما في التقويم هذا الأسبوع؟").intent).toBe("calendar");
    expect(classify("Which leases expire soon?").intent).toBe("expiring");
    expect(classify("Open maintenance work?").intent).toBe("work");
  });
  it("lists what is coming up, under the asker's own access", async () => {
    const ctx = (u: CurrentUser) => ({ user: { id: u.id, name: u.name, role: u.role }, locale: "en", currency: "EGP" as const, fx: 50 });
    const m = await runTool("calendar_upcoming", {}, ctx(mgr));
    const d = m.data as { count: number; items: { title: string; kind: string }[] };
    expect(d.count).toBeGreaterThan(0);
    expect(d.items.some((x) => x.title === "Weekly portfolio review")).toBe(true);
    const i = (await runTool("calendar_upcoming", { withinDays: 30 }, ctx(inv))).data as { items: { kind: string }[] };
    expect(i.items.some((x) => x.kind === "rent" || x.kind === "reports")).toBe(false);
  });
});
