import { describe, expect, it } from "vitest";
import { assessRisk } from "../src/lib/risk";
import { RISK_ASSUMPTIONS as R } from "../src/lib/assumptions";
import { portfolioMetrics, sentiment, momentum3m } from "../src/lib/metrics";

const base = { occupancy: "let", vacantSince: null, leaseEnd: "2028-11-12", leaseCurrency: "EGP", docs: [], districtShare: 0.1 };
const TODAY = "2026-11-12";

describe("risk model", () => {
  it("weights sum to 1", () => expect(Object.values(R.weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10));
  it("a clean let asset scores low", () => {
    const r = assessRisk(base, TODAY);
    expect(r.score).toBe(0);
    expect(r.band).toBe("low");
  });
  it("vacancy scales with days vacant and caps at 100", () => {
    const d = (n: number) => assessRisk({ ...base, occupancy: "vacant", vacantSince: new Date(Date.UTC(2026, 10, 12) - n * 86400000).toISOString().slice(0, 10), leaseEnd: null }, TODAY).drivers.find((x) => x.key === "vacancy")!.score;
    expect(d(90)).toBe(50);
    expect(d(180)).toBe(100);
    expect(d(400)).toBe(100);
  });
  it("an expired lease scores 100 for lease expiry and says it ended", () => {
    const r = assessRisk({ ...base, leaseEnd: "2026-10-12" }, TODAY).drivers.find((x) => x.key === "leaseExpiry")!;
    expect(r.score).toBe(100);
    expect(r.reason.id).toBe("leaseEnded");
  });
  it("document gaps add points per status, capped at 100", () => {
    const docs = (st: string[]) => assessRisk({ ...base, docs: st.map((status) => ({ kind: "x", status })) }, TODAY).drivers.find((x) => x.key === "documents")!.score;
    expect(docs(["missing"])).toBe(60);
    expect(docs(["expired", "pending"])).toBe(60);
    expect(docs(["missing", "expired", "pending"])).toBe(100);
  });
  it("a USD lease carries currency exposure", () => expect(assessRisk({ ...base, leaseCurrency: "USD" }, TODAY).drivers.find((x) => x.key === "fx")!.score).toBe(70));
  it("concentration is zero below the floor and 100 at the full share", () => {
    const c = (s: number) => assessRisk({ ...base, districtShare: s }, TODAY).drivers.find((x) => x.key === "concentration")!.score;
    expect(c(0.1)).toBe(0);
    expect(c(0.3)).toBe(100);
  });
  it("is deterministic", () => expect(JSON.stringify(assessRisk(base, TODAY))).toBe(JSON.stringify(assessRisk(base, TODAY))));
});

describe("market rules", () => {
  it("labels sentiment from 3-month momentum", () => {
    expect(sentiment(-0.011)).toBe("cooling");
    expect(sentiment(0)).toBe("stable");
    expect(sentiment(0.01)).toBe("stable");
    expect(sentiment(0.011)).toBe("warming");
  });
  it("computes momentum over three months", () => expect(momentum3m([100, 100, 100, 100, 110])).toBeCloseTo(0.1));
});

describe("portfolio metrics", () => {
  it("sums value and cost and groups by district and type", () => {
    const rows = [
      { valueEgp: 100, costEgp: 60, lease: {}, districtId: "a", district: { name: "A", nameAr: "أ" }, type: "villa" },
      { valueEgp: 50, costEgp: 40, lease: null, districtId: "a", district: { name: "A", nameAr: "أ" }, type: "land" },
    ] as never;
    const m = portfolioMetrics(rows);
    expect(m.value).toBe(150);
    expect(m.gain).toBe(50);
    expect(m.incomeUnits).toBe(1);
    expect(m.allocation).toHaveLength(1);
    expect(m.byType.map((t) => t.id)).toEqual(["villa", "land"]);
  });
});
