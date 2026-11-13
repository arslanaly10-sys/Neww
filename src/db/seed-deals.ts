import { and, eq } from "drizzle-orm";
import type { DB } from "./client";
import * as t from "./schema";

/**
 * A working pipeline: a dozen purchases and two sales at every stage. Asking prices are set from the sample
 * comparable sales of the same district and type, some above the market and some below, so the market check has
 * something to say.
 */
export async function seedDeals(db: DB) {
  const at = (d: string) => new Date(`${d}T09:00:00Z`);
  const median = async (districtId: string, type: string) => {
    const rows = await db.select({ p: t.comparableSales.priceEgp, a: t.comparableSales.areaSqm }).from(t.comparableSales).where(and(eq(t.comparableSales.districtId, districtId), eq(t.comparableSales.type, type)));
    const x = rows.map((r) => r.p / r.a).sort((a, b) => a - b);
    return x.length ? x[Math.floor(x.length / 2)] : 60000;
  };
  type D = { id: string; kind: "buy" | "sell"; title: string; titleAr: string; d: string; type: string; area: number; f: number; stage: string; owner: string; cp: string; src: string; close?: string; offer?: number; shared?: boolean; asset?: string; lost?: string; created: string; notes?: string };
  const list: D[] = [
    { id: "D-001", kind: "buy", title: "Corner apartment, Fifth Settlement", titleAr: "شقة ناصية، التجمع الخامس", d: "new-cairo", type: "apartment", area: 210, f: 0.94, stage: "sourcing", owner: "u-manager-1", cp: "Sample Realty (fictional)", src: "broker", created: "2026-11-03" },
    { id: "D-002", kind: "buy", title: "Retail unit on the 90th Street strip", titleAr: "وحدة تجارية على شارع التسعين", d: "new-cairo", type: "retail", area: 140, f: 1.18, stage: "sourcing", owner: "u-manager-2", cp: "Direct from owner", src: "direct", created: "2026-11-08" },
    { id: "D-003", kind: "buy", title: "Office floor, Capital Business Park", titleAr: "دور مكاتب، كابيتال بيزنس بارك", d: "new-capital", type: "office", area: 780, f: 0.88, stage: "screening", owner: "u-manager-2", cp: "Sample Developments (fictional)", src: "developer", close: "2027-02-28", created: "2026-10-12", notes: "Developer offers a 6-year instalment plan; 20% down." },
    { id: "D-004", kind: "buy", title: "Townhouse in Sheikh Zayed", titleAr: "تاون هاوس في الشيخ زايد", d: "sheikh-zayed", type: "villa", area: 320, f: 1.05, stage: "screening", owner: "u-manager-1", cp: "Sample Realty (fictional)", src: "broker", created: "2026-10-20" },
    { id: "D-005", kind: "buy", title: "Garden apartment, Maadi Degla", titleAr: "شقة بحديقة، دجلة المعادي", d: "maadi", type: "apartment", area: 190, f: 0.97, stage: "due_diligence", owner: "u-manager-1", cp: "Private seller", src: "direct", close: "2026-12-20", created: "2026-09-15", notes: "Title chain checked back to 2009; awaiting the building's licence copy.", shared: true },
    { id: "D-006", kind: "buy", title: "Mixed-use block, 6th of October", titleAr: "مبنى متعدد الاستخدام، السادس من أكتوبر", d: "6th-october", type: "mixed", area: 1400, f: 1.22, stage: "due_diligence", owner: "u-manager-2", cp: "Sample Holdings (fictional)", src: "broker", close: "2027-01-31", created: "2026-08-30" },
    { id: "D-007", kind: "buy", title: "Nile-view apartment, Zamalek", titleAr: "شقة على النيل، الزمالك", d: "zamalek", type: "apartment", area: 260, f: 1.02, stage: "offer", owner: "u-manager-1", cp: "Private seller", src: "broker", close: "2026-12-15", offer: 0.95, created: "2026-08-10", shared: true },
    { id: "D-008", kind: "buy", title: "Clinic unit, Heliopolis", titleAr: "وحدة عيادات، مصر الجديدة", d: "heliopolis", type: "office", area: 160, f: 0.9, stage: "negotiation", owner: "u-manager-2", cp: "Private seller", src: "direct", close: "2026-11-30", offer: 0.86, created: "2026-07-22", shared: true },
    { id: "D-009", kind: "sell", title: "Sale of Plot 8, Industrial Edge", titleAr: "بيع قطعة 8، الحافة الصناعية", d: "6th-october", type: "land", area: 3600, f: 1.1, stage: "negotiation", owner: "u-manager-1", cp: "Sample Logistics (fictional)", src: "direct", close: "2026-12-31", offer: 1.02, asset: "A-009", created: "2026-06-18", shared: true },
    { id: "D-010", kind: "buy", title: "Chalet, North Coast", titleAr: "شاليه، الساحل الشمالي", d: "north-coast", type: "villa", area: 150, f: 0.99, stage: "won", owner: "u-manager-2", cp: "Sample Resorts (fictional)", src: "developer", offer: 0.97, created: "2026-03-02", shared: true },
    { id: "D-011", kind: "buy", title: "Office suite, Nasr City", titleAr: "جناح مكاتب، مدينة نصر", d: "nasr-city", type: "office", area: 240, f: 1.3, stage: "lost", owner: "u-manager-1", cp: "Private seller", src: "broker", created: "2026-04-11", lost: "Seller would not come below 25% over comparable sales." },
    { id: "D-012", kind: "sell", title: "Sale of Plot 31, Beverly Extension", titleAr: "بيع قطعة 31، امتداد بيفرلي", d: "sheikh-zayed", type: "land", area: 2400, f: 1.15, stage: "screening", owner: "u-manager-2", cp: "", src: "broker", asset: "A-006", created: "2026-11-01" },
  ];
  const pos: Record<string, number> = {};
  for (const x of list) {
    const ppsqm = await median(x.d, x.type);
    const asking = Math.round((ppsqm * x.area * x.f) / 100000) * 100000;
    pos[x.stage] = (pos[x.stage] ?? 0) + 1;
    const closed = x.stage === "won" ? "2026-06-30" : x.stage === "lost" ? "2026-05-20" : null;
    await db.insert(t.deals).values({
      id: x.id, kind: x.kind, title: x.title, titleAr: x.titleAr, districtId: x.d, type: x.type, areaSqm: x.area, assetId: x.asset ?? null,
      askingEgp: asking, offerEgp: x.offer ? Math.round((asking * x.offer) / 100000) * 100000 : null, stage: x.stage, position: pos[x.stage], ownerId: x.owner,
      counterparty: x.cp, source: x.src, expectedClose: x.close ?? null, notes: x.notes ?? "", lostReason: x.lost ?? null, shared: x.shared ? 1 : 0,
      createdBy: x.owner, createdAt: at(x.created), updatedAt: at(x.created), closedOn: closed,
    });
    const ev: (typeof t.dealEvents.$inferInsert)[] = [{ id: `DE-${x.id}-1`, dealId: x.id, kind: "created", text: "", detail: { stage: "sourcing" }, actorId: x.owner, at: at(x.created) }];
    if (x.stage !== "sourcing") ev.push({ id: `DE-${x.id}-2`, dealId: x.id, kind: x.stage === "won" || x.stage === "lost" ? "closed" : "stage", text: x.lost ?? "", detail: { from: "sourcing", to: x.stage }, actorId: x.owner, at: closed ? at(closed) : at(x.created) });
    await db.insert(t.dealEvents).values(ev);
  }
}
