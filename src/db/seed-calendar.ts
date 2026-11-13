import type { DB } from "./client";
import * as t from "./schema";

/** A month of diary around the data date (12 November 2026): reviews, inspections, a viewing, investor calls. */
export async function seedCalendar(db: DB) {
  const at = new Date("2026-11-01T08:00:00Z");
  const e = (id: string, o: { title: string; titleAr: string; kind: string; date: string; start?: string; end?: string; assetId?: string; location?: string; notes?: string; shared?: boolean; attendees: string[]; by?: string }) => ({
    id, title: o.title, titleAr: o.titleAr, kind: o.kind, date: o.date, startTime: o.start ?? null, endTime: o.end ?? null, assetId: o.assetId ?? null,
    location: o.location ?? "", notes: o.notes ?? "", shared: o.shared ? 1 : 0, attendees: o.attendees, createdBy: o.by ?? "u-manager-1", createdAt: at, updatedAt: at,
  });
  const team = ["u-manager-1", "u-manager-2"];
  await db.insert(t.calendarEvents).values([
    e("CE-001", { title: "Lender meeting on the Gardenia refinancing", titleAr: "اجتماع مع البنك بشأن إعادة تمويل جاردينيا", kind: "meeting", date: "2026-11-04", start: "11:00", end: "12:30", assetId: "A-008", location: "Bank office, Garden City", attendees: ["u-manager-2"], by: "u-manager-2" }),
    e("CE-002", { title: "Weekly portfolio review", titleAr: "المراجعة الأسبوعية للمحفظة", kind: "meeting", date: "2026-11-12", start: "10:00", end: "11:00", location: "Office, meeting room 2", notes: "Arrears, open work orders, renewals due in the next 90 days.", attendees: team }),
    e("CE-003", { title: "Quarterly building inspection", titleAr: "الفحص الربع سنوي للمبنى", kind: "inspection", date: "2026-11-15", start: "09:30", end: "11:30", assetId: "A-002", location: "Tagamoa Business Hub, floor 6", attendees: ["u-manager-1"] }),
    e("CE-004", { title: "Investor quarterly call", titleAr: "المكالمة الربع سنوية مع المستثمر", kind: "meeting", date: "2026-11-18", start: "14:00", end: "15:00", location: "Video call", notes: "Q3 results, the proposed distribution and the 2027 budget.", shared: true, attendees: ["u-investor", "u-manager-1"] }),
    e("CE-005", { title: "Viewing with a prospective tenant", titleAr: "معاينة مع مستأجر محتمل", kind: "viewing", date: "2026-11-19", start: "16:00", end: "16:45", assetId: "A-004", location: "Dunes Residence, gate 2", attendees: ["u-manager-2"], by: "u-manager-2" }),
    e("CE-006", { title: "Weekly portfolio review", titleAr: "المراجعة الأسبوعية للمحفظة", kind: "meeting", date: "2026-11-19", start: "10:00", end: "11:00", location: "Office, meeting room 2", attendees: team }),
    e("CE-007", { title: "2027 budget draft due", titleAr: "موعد تسليم مسودة موازنة 2027", kind: "deadline", date: "2026-11-25", attendees: team }),
    e("CE-008", { title: "Fire safety inspection", titleAr: "فحص السلامة من الحريق", kind: "inspection", date: "2026-12-02", start: "10:00", end: "12:00", assetId: "A-005", location: "Zayed Arcade, unit 14", attendees: ["u-manager-2"], by: "u-manager-2" }),
    e("CE-009", { title: "Annual investor meeting", titleAr: "الاجتماع السنوي للمستثمرين", kind: "meeting", date: "2026-12-10", start: "11:00", end: "13:00", location: "Office, boardroom", shared: true, attendees: ["u-investor", ...team] }),
  ]);
}
