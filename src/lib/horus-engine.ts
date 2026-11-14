import { z } from "zod";
import { DEMO_TODAY, DISTRICT_PPSQM, HORUS_ASSUMPTIONS as H, SAMPLE_FX_EGP_PER_USD, SCENARIO_ASSUMPTIONS, VALUATION_ASSUMPTIONS as V } from "./assumptions";
import { ageFactor, floorFactor, type Market } from "./valuation";

/**
 * HORUS valuation engine, version 2. Pure and deterministic: the same inputs, comparables and assumptions always give
 * the same result. No AI takes part in the arithmetic; a language model may only describe the result afterwards.
 *
 * Methods, each applied only where it fits the asset:
 *  - Comparable sales: the most similar sales, each adjusted for time, location, size, condition, age, floor, payment
 *    terms and asking-versus-transaction, weighted by similarity and by how strong the evidence is.
 *  - Income: rent less vacancy and running costs, capitalised; a 5-year discounted cash flow as a cross-check.
 *  - Cost: land plus the depreciated cost of rebuilding.
 *  - Off-plan: the finished value discounted for the time to handover, with the remaining instalments in present value.
 */

export const INTAKE_TYPES = ["apartment", "villa", "land", "clinic", "office", "retail", "mixed"] as const;
/** The types offered on the public questionnaire (mixed-use blocks are valued from the asset record only). */
export const PUBLIC_TYPES = ["apartment", "villa", "land", "clinic", "office", "retail"] as const;
export const AMENITIES = ["parking", "view", "garden", "pool", "security", "elevator"] as const;
export const CONDITIONS = ["core_shell", "semi_finished", "fully_finished", "luxury"] as const;
const opt = <T extends z.ZodTypeAny>(s: T) => z.union([z.literal(""), z.null(), s]).optional().transform((v) => (v === "" || v === undefined ? null : v));
const num = (min: number, max: number) => opt(z.coerce.number().min(min).max(max));
const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const IntakeSchema = z.object({
  type: z.enum(INTAKE_TYPES),
  districtId: z.string().max(40), // a district id, or "other" for elsewhere in Egypt
  compound: z.string().trim().max(120).optional().default(""),
  areaSqm: num(10, 100000),
  plotAreaSqm: num(10, 1000000),
  beds: num(0, 20), baths: num(0, 20), floor: num(0, 80), yearBuilt: num(1900, 2035),
  condition: opt(z.enum(CONDITIONS)),
  status: z.enum(["ready", "under_construction", "off_plan"]).default("ready"),
  deliveryOn: opt(ISO),
  occupancy: z.enum(["vacant", "let", "owner"]).default("owner"),
  amenities: z.array(z.enum(AMENITIES)).max(AMENITIES.length).default([]),
  purpose: z.enum(["sale", "hold", "review"]).default("review"),
  purchasePriceEgp: num(1000, 1e11), purchaseDate: opt(ISO),
  monthlyRentEgp: num(100, 1e9),
  installmentBalanceEgp: num(0, 1e11), installmentMonthsLeft: num(0, 240),
  permittedUse: opt(z.enum(["residential", "commercial", "industrial", "agricultural", "unknown"])),
  frontageM: num(1, 10000), utilities: opt(z.enum(["yes", "no", "unknown"])),
}).superRefine((v, ctx) => {
  if (v.type === "land" ? !v.plotAreaSqm : !v.areaSqm) ctx.addIssue({ code: "custom", path: [v.type === "land" ? "plotAreaSqm" : "areaSqm"], message: "required" });
  if (v.status !== "ready" && v.deliveryOn && v.deliveryOn < DEMO_TODAY) ctx.addIssue({ code: "custom", path: ["deliveryOn"], message: "past" });
});
export type Intake = z.infer<typeof IntakeSchema>;

export interface Sale { id: string; districtId: string; type: string; areaSqm: number; floor: number | null; finish: string; yearBuilt: number | null; soldOn: string; priceEgp: number; evidenceKind: string; paymentTerms: string; source: string; sourceDate: string | null }
export type AdjKey = "time" | "location" | "size" | "condition" | "age" | "floor" | "terms" | "asking";
export interface UsedComp { id: string; districtId: string; areaSqm: number; soldOn: string; priceEgp: number; ppsqm: number; evidenceKind: string; paymentTerms: string; source: string; adjustments: Record<AdjKey, number>; grossAdjustment: number; adjustedPpsqm: number; similarity: number; weight: number }
export type MethodId = "comparables" | "income" | "cost" | "offplan" | "land_index";
export interface MethodResult { id: MethodId; applicable: boolean; reason?: string; valueEgp: number | null; weight: number; workings: Record<string, number | string | null> }
export interface Factor { id: string; points: number; params?: Record<string, string | number> }
export interface RunResult {
  modelVersion: string; assumptionsVersion: string; asOf: string; currency: "EGP";
  methods: MethodResult[]; comps: UsedComp[];
  evidence: { n: number; transaction: number; signed: number; asking: number; installments: number; medianMonths: number | null; otherDistricts: number };
  valueEgp: number; lowEgp: number; highEgp: number;
  confidence: { score: number; level: "high" | "medium" | "low"; factors: Factor[] };
  missing: string[];
  views: { usd: { value: number; low: number; high: number; rate: number }; real: { baseMonth: string; valueEgp: number; deflator: number; source: string; published: string } };
  drivers: { key: AdjKey | "amenities" | "method"; pct: number }[];
  sources: { id: string; label: string; date: string | null; kind: string }[];
}

const round = (x: number, step = 10000) => Math.round(x / step) * step;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const months = (a: string, b: string) => (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / (30.4375 * 86400000);
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const modelType = (t: Intake["type"]) => (t === "clinic" ? "office" : t);
const commercial = (t: Intake["type"]) => t === "office" || t === "retail" || t === "clinic" || t === "mixed";

function weightedQuantile(values: number[], weights: number[], q: number) {
  const idx = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
  const total = weights.reduce((s, w) => s + w, 0);
  let acc = 0;
  for (const i of idx) { acc += weights[i]; if (acc >= q * total) return values[i]; }
  return values[idx[idx.length - 1]];
}

/** Comparable sales: select, adjust each one explicitly, weight by similarity and evidence strength. */
export function compsMethod(i: Intake, sales: Sale[], market: Market, today = DEMO_TODAY) {
  const C = H.comps;
  const type = modelType(i.type);
  const local = i.districtId !== "other" && !!DISTRICT_PPSQM[i.districtId];
  const area = i.areaSqm ?? i.plotAreaSqm ?? 0;
  const age = i.yearBuilt ? Math.max(0, 2026 - i.yearBuilt) : i.status !== "ready" ? 0 : null;
  const finish = i.condition ?? "fully_finished";
  const subjectBase = local ? DISTRICT_PPSQM[i.districtId] : null;
  const used = sales.filter((s) => s.type === type && months(s.soldOn, today) <= C.horizonMonths).map((s): UsedComp => {
    const ppsqm = s.priceEgp / s.areaSqm;
    const sAge = s.yearBuilt === null ? null : Math.max(0, 2026 - s.yearBuilt);
    const adj: Record<AdjKey, number> = {
      time: market.now(s.districtId) / market.at(s.districtId, s.soldOn) - 1,
      location: subjectBase ? subjectBase / DISTRICT_PPSQM[s.districtId] - 1 : 0,
      size: Math.pow(s.areaSqm / area, C.sizeElasticity) - 1,
      condition: V.finishFactor[finish] / V.finishFactor[s.finish as keyof typeof V.finishFactor] - 1,
      age: ageFactor(age) / ageFactor(sAge) - 1,
      floor: floorFactor(type, i.floor) / floorFactor(type, s.floor) - 1,
      terms: s.paymentTerms === "installments" ? C.installmentsToCash : 0,
      asking: s.evidenceKind === "asking" ? C.askingToTransaction : 0,
    };
    const factor = Object.values(adj).reduce((p, a) => p * (1 + a), 1);
    const gross = Object.values(adj).reduce((p, a) => p + Math.abs(a), 0);
    const recency = Math.max(0.3, 1 - months(s.soldOn, today) / C.horizonMonths);
    const sameDistrict = local && s.districtId === i.districtId;
    const similarity = clamp((sameDistrict ? 1 : C.otherDistrictPenalty) * recency * (1 - Math.min(0.8, gross)), 0.01, 1);
    const ev = C.evidenceWeight[s.evidenceKind as keyof typeof C.evidenceWeight] ?? 0.5;
    return { id: s.id, districtId: s.districtId, areaSqm: s.areaSqm, soldOn: s.soldOn, priceEgp: s.priceEgp, ppsqm: Math.round(ppsqm), evidenceKind: s.evidenceKind, paymentTerms: s.paymentTerms, source: s.source,
      adjustments: Object.fromEntries(Object.entries(adj).map(([k, v]) => [k, r3(v)])) as Record<AdjKey, number>, grossAdjustment: r3(gross), adjustedPpsqm: Math.round(ppsqm * factor), similarity: r3(similarity), weight: r3(similarity * ev) };
  }).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id)).slice(0, C.count);
  const amen = Math.min(H.amenityCap, i.amenities.reduce((s, a) => s + H.amenityPremium[a], 0)) + (i.type === "clinic" ? H.clinicPremium : 0);
  if (!used.length || !area) return { used, value: null, low: null, high: null, amen };
  const w = used.map((c) => c.weight);
  const total = w.reduce((s, x) => s + x, 0);
  const pp = used.reduce((s, c) => s + c.adjustedPpsqm * c.weight, 0) / total;
  const implied = used.map((c) => c.adjustedPpsqm * area * (1 + amen));
  return { used, value: pp * area * (1 + amen), low: weightedQuantile(implied, w, 0.2), high: weightedQuantile(implied, w, 0.8), amen, ppsqm: Math.round(pp) };
}

/** Income: rent less vacancy and running costs, capitalised; and a 5-year discounted cash flow with an exit value. */
export function incomeMethod(i: Intake) {
  if (!i.monthlyRentEgp) return null;
  const I = H.income;
  const type = modelType(i.type) as keyof typeof SCENARIO_ASSUMPTIONS.capRateByType;
  const cap = SCENARIO_ASSUMPTIONS.capRateByType[type];
  const gross = i.monthlyRentEgp * 12;
  const vacancy = commercial(i.type) ? I.vacancy.commercial : I.vacancy.residential;
  const noi = gross * (1 - vacancy) * (1 - I.opexShare);
  const direct = noi / cap;
  const disc = cap + I.rentGrowth + I.discountUplift;
  let pv = 0;
  for (let y = 1; y <= I.horizonYears; y++) pv += (noi * Math.pow(1 + I.rentGrowth, y - 1)) / Math.pow(1 + disc, y);
  const exit = (noi * Math.pow(1 + I.rentGrowth, I.horizonYears)) / (cap + I.exitCapUplift);
  const dcf = pv + exit / Math.pow(1 + disc, I.horizonYears);
  return { value: direct, workings: { grossAnnualRent: Math.round(gross), vacancyPct: vacancy * 100, opexPct: I.opexShare * 100, noi: Math.round(noi), capRatePct: r3(cap * 100), directCap: Math.round(direct), dcfValue: Math.round(dcf), discountRatePct: r3(disc * 100), exitValue: Math.round(exit) } };
}

/** Cost: land at the district land level plus the depreciated cost of rebuilding what stands on it. */
export function costMethod(i: Intake) {
  if (i.districtId === "other" || !DISTRICT_PPSQM[i.districtId]) return null;
  const K = H.cost;
  const plot = i.plotAreaSqm ?? (i.type === "land" ? i.areaSqm : null);
  if (!plot && i.type !== "villa") return null;
  const landPpsqm = DISTRICT_PPSQM[i.districtId] * K.landFactor;
  const land = (plot ?? 0) * landPpsqm;
  const built = i.type === "land" ? 0 : i.areaSqm ?? 0;
  const age = i.yearBuilt ? Math.max(0, 2026 - i.yearBuilt) : 0;
  const dep = Math.min(K.depreciationCap, age * K.depreciationPerYear);
  const rebuild = built * K.replacementPerSqm[i.condition ?? "fully_finished"];
  return { value: land + rebuild * (1 - dep), workings: { plotSqm: plot, landPpsqm: Math.round(landPpsqm), landValue: Math.round(land), builtSqm: built, replacementPerSqm: K.replacementPerSqm[i.condition ?? "fully_finished"], depreciationPct: r3(dep * 100), buildingValue: Math.round(rebuild * (1 - dep)) } };
}

/** Off-plan: the finished unit's value today, discounted for the wait; remaining instalments in present value. */
export function offPlanMethod(i: Intake, readyValue: number | null, today = DEMO_TODAY) {
  if (i.status === "ready" || readyValue === null) return null;
  const O = H.offPlan;
  const m = i.deliveryOn ? Math.max(0, months(today, i.deliveryOn)) : 24;
  const disc = Math.pow(1 + O.annualDiscount, -m / 12);
  const bal = i.installmentBalanceEgp ?? 0;
  const n = i.installmentMonthsLeft ?? 0;
  const monthly = n ? bal / n : 0;
  const r = Math.pow(1 + O.installmentDiscount, 1 / 12) - 1;
  const pvBal = n ? monthly * ((1 - Math.pow(1 + r, -n)) / r) : bal;
  const value = readyValue * disc;
  return { value, workings: { readyValue: Math.round(readyValue), monthsToHandover: Math.round(m), timeDiscountPct: r3((1 - disc) * 100), remainingInstalments: Math.round(bal), instalmentsPresentValue: Math.round(pvBal), ownerEquity: Math.round(value - pvBal) } };
}

/** Prices of a past month, by the CPI path: how much today's figure would be in that month's money. */
export function deflate(valueEgp: number, baseMonth: string) {
  const pts = Object.entries(H.cpi.points).sort(([a], [b]) => a.localeCompare(b));
  const at = (m: string) => { let v = pts[0][1]; for (const [k, x] of pts) if (k <= m) v = x; return v; };
  const d = at(DEMO_TODAY.slice(0, 7)) / at(baseMonth);
  return { valueEgp: round(valueEgp / d), deflator: r3(d) };
}

/** Run every method that fits, reconcile them, and say how sure the result is and why. */
export function runHorus(i: Intake, sales: Sale[], market: Market, sources: { market: { label: string; date: string | null } }, today = DEMO_TODAY): RunResult {
  const Wt = H.weights;
  const local = i.districtId !== "other" && !!DISTRICT_PPSQM[i.districtId];
  const isLand = i.type === "land";
  const cm = isLand ? null : compsMethod(i, sales, market, today);
  const inc = incomeMethod(i);
  const cost = costMethod(i);
  const ready = i.status === "ready";
  const off = !ready && cm ? offPlanMethod(i, cm.value, today) : null;
  const methods: MethodResult[] = [];
  const n = cm?.used.length ?? 0;
  const compsWeight = cm?.value ? (n >= 3 ? Wt.comps : Wt.compsThin) : 0;
  methods.push({ id: "comparables", applicable: !!cm?.value && ready, reason: isLand ? "land" : !cm?.value ? "noComps" : !ready ? "offPlanUsesReady" : undefined, valueEgp: cm?.value ? round(cm.value) : null, weight: ready ? compsWeight : 0, workings: { comps: n, adjustedPpsqm: cm?.ppsqm ?? null, amenityPremiumPct: cm ? r3(cm.amen * 100) : null } });
  if (!ready) methods.push({ id: "offplan", applicable: !!off, reason: off ? undefined : "noComps", valueEgp: off ? round(off.value) : null, weight: off ? compsWeight : 0, workings: off?.workings ?? {} });
  methods.push({ id: "income", applicable: !!inc, reason: inc ? undefined : "noRent", valueEgp: inc ? round(inc.value) : null, weight: inc ? (commercial(i.type) ? Wt.incomeCommercial : Wt.income) : 0, workings: inc?.workings ?? {} });
  methods.push({ id: "cost", applicable: !!cost, reason: cost ? undefined : "noPlot", valueEgp: cost ? round(cost.value) : null, weight: cost ? (isLand ? Wt.costLand : i.type === "villa" ? Wt.costVilla : Wt.costOther) : 0, workings: cost?.workings ?? {} });
  const live = methods.filter((m) => m.weight > 0 && m.valueEgp !== null);
  const wsum = live.reduce((s, m) => s + m.weight, 0);
  for (const m of methods) m.weight = wsum ? r3(m.weight / wsum) : 0;
  const value = wsum ? live.reduce((s, m) => s + (m.valueEgp as number) * (m.weight), 0) : 0;

  // Evidence and confidence.
  const used = cm?.used ?? [];
  const ev = {
    n: used.length, transaction: used.filter((c) => c.evidenceKind === "transaction").length, signed: used.filter((c) => c.evidenceKind === "signed").length,
    asking: used.filter((c) => c.evidenceKind === "asking").length, installments: used.filter((c) => c.paymentTerms === "installments").length,
    medianMonths: used.length ? Math.round([...used].map((c) => months(c.soldOn, today)).sort((a, b) => a - b)[used.length >> 1]) : null,
    otherDistricts: used.filter((c) => c.districtId !== i.districtId).length,
  };
  const factors: Factor[] = [];
  if (!local) factors.push({ id: "otherRegion", points: 35 });
  if (isLand) factors.push({ id: "landIndex", points: 15 });
  else if (ev.n < 3) factors.push({ id: "fewComps", points: 30, params: { n: ev.n } });
  else if (ev.n < 5) factors.push({ id: "someComps", points: 15, params: { n: ev.n } });
  if (ev.n && ev.asking / ev.n > 0.4) factors.push({ id: "askingHeavy", points: 10, params: { n: ev.asking, total: ev.n } });
  if (ev.n && ev.otherDistricts / ev.n > 0.5) factors.push({ id: "otherDistricts", points: 10, params: { n: ev.otherDistricts } });
  const avgGross = used.length ? used.reduce((s, c) => s + c.grossAdjustment, 0) / used.length : 0;
  if (avgGross > 0.25) factors.push({ id: "largeAdjustments", points: 10, params: { pct: Math.round(avgGross * 100) } });
  if (ev.medianMonths !== null && ev.medianMonths > 12) factors.push({ id: "olderEvidence", points: 8, params: { months: ev.medianMonths } });
  if (!ready) factors.push({ id: "deliveryRisk", points: 10 });
  const vals = live.map((m) => m.valueEgp as number);
  if (vals.length > 1 && Math.max(...vals) / Math.min(...vals) - 1 > 0.2) factors.push({ id: "methodsDisagree", points: 10, params: { pct: Math.round((Math.max(...vals) / Math.min(...vals) - 1) * 100) } });
  const missing: string[] = [];
  if (!isLand && i.yearBuilt === null && ready) missing.push("yearBuilt");
  if (!isLand && i.condition === null) missing.push("condition");
  if ((i.type === "apartment" || i.type === "office" || i.type === "clinic") && i.floor === null) missing.push("floor");
  if (i.type === "villa" && i.plotAreaSqm === null) missing.push("plotAreaSqm");
  if (isLand && !i.permittedUse) missing.push("permittedUse");
  if (i.occupancy === "let" && !i.monthlyRentEgp) missing.push("monthlyRentEgp");
  if (!ready && !i.deliveryOn) missing.push("deliveryOn");
  if (missing.length) factors.push({ id: "missingInputs", points: Math.min(16, missing.length * 4), params: { n: missing.length } });
  if (!live.length) factors.push({ id: "noMethod", points: 100 });
  const score = clamp(100 - factors.reduce((s, f) => s + f.points, 0), 0, 100);
  const level = score >= H.confidence.highFrom ? "high" : score >= H.confidence.mediumFrom ? "medium" : "low";
  const spread = clamp(H.range.base + (100 - score) * H.range.perPointBelow100, H.range.base, H.range.max);
  let low = value * (1 - spread), high = value * (1 + spread);
  if (cm?.low && cm.high && ready && live.length === 1) { low = Math.min(low, cm.low); high = Math.max(high, cm.high); }

  // Drivers: the average effect of each adjustment across the comparables, weighted as they are.
  const drivers: RunResult["drivers"] = [];
  if (used.length) {
    const tw = used.reduce((s, c) => s + c.weight, 0);
    for (const k of ["time", "location", "size", "condition", "age", "floor", "terms", "asking"] as AdjKey[]) drivers.push({ key: k, pct: r3((used.reduce((s, c) => s + c.adjustments[k] * c.weight, 0) / tw) * 100) });
    if (cm?.amen) drivers.push({ key: "amenities", pct: r3(cm.amen * 100) });
    drivers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  }
  const baseMonth = i.purchaseDate ? i.purchaseDate.slice(0, 7) : "2024-01";
  const real = deflate(value, baseMonth);
  const compSources = [...new Map(used.map((c) => [c.source, c.soldOn])).entries()].map(([label, date]) => ({ id: `comps:${label}`, label, date: used.filter((c) => c.source === label).map((c) => c.soldOn).sort().at(-1) ?? date, kind: "comparables" }));
  return {
    modelVersion: H.modelVersion, assumptionsVersion: H.version, asOf: today, currency: "EGP",
    methods, comps: used, evidence: ev, valueEgp: round(value), lowEgp: round(low), highEgp: round(high),
    confidence: { score, level, factors }, missing,
    views: { usd: { value: Math.round(value / SAMPLE_FX_EGP_PER_USD), low: Math.round(low / SAMPLE_FX_EGP_PER_USD), high: Math.round(high / SAMPLE_FX_EGP_PER_USD), rate: SAMPLE_FX_EGP_PER_USD }, real: { baseMonth, valueEgp: real.valueEgp, deflator: real.deflator, source: H.cpi.source, published: H.cpi.published } },
    drivers: drivers.slice(0, 5),
    sources: [...compSources, { id: "market", label: sources.market.label, date: sources.market.date, kind: "index" }, { id: "assumptions", label: `${H.version} (${H.note})`, date: null, kind: "assumptions" }, { id: "cpi", label: H.cpi.source, date: H.cpi.published, kind: "cpi" }],
  };
}
