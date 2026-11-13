import type { CalItem } from "./calendar";
import { addDays } from "./calendar-dates";

/** RFC 5545 text: escape backslashes, semicolons, commas and newlines. */
export const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Lines longer than 75 octets are folded: CRLF and a space, never splitting a UTF-8 character. */
export function fold(line: string) {
  const out: string[] = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * A calendar file for the items given. Times are Cairo local time (TZID Africa/Cairo). Egypt has kept summer time again
 * since 2023, from the last Friday of April to the last Thursday of October, so the VTIMEZONE carries both rules.
 * All-day items use DATE values.
 */
export function toIcs(items: CalItem[], o: { name: string; base: string; now: Date }) {
  const L: string[] = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ZMNHOOF OS//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsText(o.name)}`, "X-WR-TIMEZONE:Africa/Cairo",
    "BEGIN:VTIMEZONE", "TZID:Africa/Cairo",
    "BEGIN:STANDARD", "DTSTART:19701029T000000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1TH", "TZOFFSETFROM:+0300", "TZOFFSETTO:+0200", "TZNAME:EET", "END:STANDARD",
    "BEGIN:DAYLIGHT", "DTSTART:19700424T000000", "RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=-1FR", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0300", "TZNAME:EEST", "END:DAYLIGHT",
    "END:VTIMEZONE",
  ];
  const d8 = (d: string) => d.replace(/-/g, "");
  const t6 = (t: string) => `${t.replace(":", "")}00`;
  for (const i of items) {
    L.push("BEGIN:VEVENT", `UID:${i.id.replace(/[^A-Za-z0-9:.-]/g, "-")}@zmnhoof.example`, `DTSTAMP:${stamp(o.now)}`);
    if (i.start) {
      L.push(`DTSTART;TZID=Africa/Cairo:${d8(i.date)}T${t6(i.start)}`);
      const end = i.end ?? `${String(Math.min(23, Number(i.start.slice(0, 2)) + 1)).padStart(2, "0")}:${i.start.slice(3)}`;
      L.push(`DTEND;TZID=Africa/Cairo:${d8(i.date)}T${t6(end)}`);
    } else {
      L.push(`DTSTART;VALUE=DATE:${d8(i.date)}`, `DTEND;VALUE=DATE:${d8(addDays(i.date, 1))}`);
    }
    L.push(`SUMMARY:${icsText(i.title)}`);
    const desc = [i.detail, i.assetName].filter(Boolean).join("\n");
    if (desc) L.push(`DESCRIPTION:${icsText(desc)}`);
    if (i.source === "events" && i.detail) L.push(`LOCATION:${icsText(i.detail)}`);
    L.push(`CATEGORIES:${i.source.toUpperCase()}`, `URL:${o.base}${i.link}`, "TRANSP:" + (i.start ? "OPAQUE" : "TRANSPARENT"), "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}
