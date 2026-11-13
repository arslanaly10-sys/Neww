import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "14.1.1.1" }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { withSession } from "../src/db/client";
import { dealEvents, deals } from "../src/db/schema";
import { addDealNote, createDeal, getDeal, listDeals, marketCheck, moveDeal, PROBABILITY, updateDeal } from "../src/lib/deals";
import { getCalendar } from "../src/lib/calendar";
import { listNotifications } from "../src/lib/notify";
import { classify } from "../src/lib/horus/scripted";
import { runTool } from "../src/lib/horus/tools";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const mgr = U("u-manager-1", "manager"), mgr2 = U("u-manager-2", "manager"), inv = U("u-investor", "investor"), adm = U("u-admin", "admin");
const base = { kind: "buy", title: "Test villa in Maadi", districtId: "maadi", type: "villa", areaSqm: "300", askingEgp: "30000000", ownerId: "u-manager-2", source: "broker" };

describe("the market check", () => {
  it("compares price per m² with the median of comparable sales, and needs three", () => {
    const comps = [{ priceEgp: 1_000_000, areaSqm: 100 }, { priceEgp: 1_200_000, areaSqm: 100 }, { priceEgp: 1_100_000, areaSqm: 100 }];
    expect(marketCheck(2_200_000, 200, comps)).toEqual({ medianPpsqm: 11000, dealPpsqm: 11000, diff: 0, n: 3 });
    expect(marketCheck(2_420_000, 200, comps)!.diff).toBeCloseTo(0.1, 5);
    expect(marketCheck(1_000_000, null, comps)).toBeNull();
    expect(marketCheck(1_000_000, 100, comps.slice(0, 2))).toBeNull();
  });
});

describe("the pipeline", () => {
  it("managers see every deal with weighted values and market checks; totals add up", async () => {
    const d = (await listDeals(mgr))!;
    expect(d.items.length).toBe(12);
    const open = d.items.filter((x) => !["won", "lost"].includes(x.stage));
    expect(d.totals.open).toBe(open.length);
    expect(d.totals.weightedEgp).toBe(open.reduce((s, x) => s + Math.round((x.offerEgp ?? x.askingEgp) * PROBABILITY[x.stage]), 0));
    expect(d.items.filter((x) => x.market).length).toBeGreaterThan(6);
    expect(d.items.find((x) => x.id === "D-011")!.market!.diff).toBeGreaterThan(0.2); // the lost one, priced well above the market
    expect(d.funnel.map((f) => f.stage)).toEqual(["sourcing", "screening", "due_diligence", "offer", "negotiation", "won", "lost"]);
  });
  it("investors see only shared deals, without notes, counterparty or note events; admins see none", async () => {
    const d = (await listDeals(inv))!;
    expect(d.items.length).toBeGreaterThan(0);
    expect(d.items.every((x) => x.shared && x.notes === "" && x.counterparty === "")).toBe(true);
    const rows = await withSession({ userId: inv.id, role: "investor" }, (tx) => tx.select().from(deals));
    expect(rows.every((r) => r.shared === 1)).toBe(true);
    expect(await getDeal(inv, "D-001")).toBeNull();
    expect(await listDeals(adm)).toBeNull();
  });
});

describe("working deals", () => {
  let id = "";
  it("creates a deal at the start of sourcing and tells its owner", async () => {
    expect(await createDeal(inv, base)).toEqual({ ok: false, error: "forbidden" });
    expect(await createDeal(mgr, { ...base, kind: "sell" })).toEqual({ ok: false, error: "invalid" }); // a sale needs a holding
    expect(await createDeal(mgr, { ...base, districtId: "atlantis" })).toEqual({ ok: false, error: "invalid" });
    const r = await createDeal(mgr, base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    id = r.id;
    const d = (await getDeal(mgr, id))!;
    expect(d.deal).toMatchObject({ stage: "sourcing", position: 0, ownerId: "u-manager-2", areaSqm: 300 });
    expect(d.events.map((e) => e.kind)).toEqual(["created"]);
    expect((await listNotifications(mgr2, "en")).find((n) => n.kind === "deal_assigned" && n.link === `/deals/${id}`)!.title).toBe(`Deal ${id} is yours: Test villa in Maadi`);
  });
  it("moves between stages and places, keeps positions tidy, and needs a reason to lose", async () => {
    expect(await moveDeal(mgr, id, { stage: "screening", position: 0 })).toMatchObject({ ok: true });
    const col = (await listDeals(mgr))!.items.filter((x) => x.stage === "screening").sort((a, b) => a.position - b.position);
    expect(col[0].id).toBe(id);
    expect(col.map((x) => x.position)).toEqual(col.map((_, i) => i));
    expect(await moveDeal(mgr, id, { stage: "screening", position: 0 })).toEqual({ ok: true, auditSeq: null }); // no change
    expect(await moveDeal(mgr, id, { stage: "lost" })).toEqual({ ok: false, error: "reason" });
    expect(await moveDeal(mgr, id, { stage: "lost", reason: "Seller withdrew." })).toMatchObject({ ok: true });
    const lost = (await getDeal(mgr, id))!;
    expect(lost.deal).toMatchObject({ stage: "lost", lostReason: "Seller withdrew.", closedOn: "2026-11-12" });
    expect((await listNotifications(mgr2, "en")).some((n) => n.kind === "deal_stage" && n.title === `${id} moved to lost: Test villa in Maadi`)).toBe(true);
    expect(await moveDeal(mgr, id, { stage: "negotiation" })).toMatchObject({ ok: true });
    expect((await getDeal(mgr, id))!.deal).toMatchObject({ stage: "negotiation", closedOn: null, lostReason: null });
  });
  it("records offers, owner changes and sharing on the timeline; notes stay with the team", async () => {
    const r = await updateDeal(mgr, id, { ...base, offerEgp: "27500000", ownerId: "u-manager-1", shared: "on" });
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.changed).toEqual(expect.arrayContaining(["offerEgp", "ownerId", "shared"]));
    expect(await addDealNote(mgr, id, "Agent says the seller wants a quick close.")).toEqual({ ok: true });
    const kinds = (await getDeal(mgr, id))!.events.map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(["offer", "owner", "shared", "note"]));
    const seen = (await getDeal(inv, id))!;
    expect(seen.events.some((e) => e.kind === "note")).toBe(false);
    const raw = await withSession({ userId: inv.id, role: "investor" }, (tx) => tx.select().from(dealEvents));
    expect(raw.some((e) => e.kind === "note")).toBe(false);
    expect(await addDealNote(inv, id, "hello")).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("around the app", () => {
  it("expected closing dates appear on the calendar", async () => {
    const items = (await getCalendar(mgr, "en", "2026-11-01", "2027-03-31"))!;
    expect(items.find((i) => i.id === "deal:D-007")).toMatchObject({ source: "deals", date: "2026-12-15", title: "D-007 expected to close: Nile-view apartment, Zamalek" });
    expect((await getCalendar(inv, "en", "2026-11-01", "2027-03-31"))!.some((i) => i.id === "deal:D-003")).toBe(false); // not shared
  });
  it("Horus answers pipeline questions", async () => {
    expect(classify("How is the deal pipeline looking?").intent).toBe("deals");
    expect(classify("ما وضع الصفقات؟").intent).toBe("deals");
    expect(classify("Should I buy in Zamalek?").intent).toBe("advice");
    const ctx = { user: { id: mgr.id, name: mgr.name, role: mgr.role }, locale: "en", currency: "EGP" as const, fx: 50 };
    const d = (await runTool("deal_pipeline", {}, ctx)).data as { open: number; furthestAlong: { stage: string }[] };
    expect(d.open).toBeGreaterThan(5);
    expect(d.furthestAlong[0].stage).toBe("negotiation");
  });
});
