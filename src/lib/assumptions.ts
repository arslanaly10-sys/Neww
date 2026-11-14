/**
 * Versioned assumption sets. Every figure in the demo traces to one of these.
 * ALL VALUES ARE SYNTHETIC SAMPLE ASSUMPTIONS, not market facts.
 */
export const DEMO_TODAY = "2026-11-12"; // fixed "as of" date so the demo looks identical every time
export const SAMPLE_FX_EGP_PER_USD = 50;

export const VALUATION_ASSUMPTIONS = {
  version: "1.0.0",
  note: "Hedonic price-per-sqm model with comparable-sales cross-check. Sample coefficients, not calibrated to any real market.",
  typeFactor: { apartment: 1.0, villa: 1.32, office: 1.18, retail: 1.42, land: 0.34, mixed: 1.12 },
  finishFactor: { core_shell: 0.82, semi_finished: 0.92, fully_finished: 1.0, luxury: 1.14 },
  floor: { groundPenalty: -0.04, perFloorPremium: 0.006, cap: 0.09, exemptTypes: ["villa", "land"] },
  age: { newPremium: 0.04, floorFactor: 0.82, flattenAtYears: 25 },
  // Market factor = weight x (district index at date / index at first month) + (1 - weight).
  market: { weight: 0.94 },
  comps: { count: 5, otherDistrictPenalty: 0.6, differentFinishPenalty: 0.85, areaLogSpan: 3, recencyHorizonMonths: 24, recencyFloor: 0.3 },
  confidence: { highMinComps: 5, highMaxDispersion: 0.1, mediumMinComps: 3, mediumMaxDispersion: 0.18, highMaxMedianAgeMonths: 12 },
  range: { minSpread: 0.05, maxSpread: 0.25, dispersionMultiplier: 1.5, lowConfidenceUplift: 1.25 },
  adjustment: { secondApproverAbovePct: 0.1, minReasonLength: 10, staleAfterMonths: 12 },
} as const;

export const MACRO_ASSUMPTIONS = {
  version: "1.0.0",
  note: "Sample macro baseline for scenarios. Not a forecast.",
  fxEgpPerUsd: SAMPLE_FX_EGP_PER_USD,
  policyRatePct: 24,
  vacancyShockPct: 0,
  rentGrowthPct: 8,
  slider: { fx: [40, 70], rate: [10, 35], vacancy: [0, 40], rentGrowth: [-5, 25] },
  cases: { low: { fx: -5, rate: 4, vacancy: 10, rentGrowth: -4 }, high: { fx: 5, rate: -3, vacancy: -5, rentGrowth: 3 } },
} as const;

const RAW_PPSQM: Record<string, number> = {
  "new-cairo": 62000, "sheikh-zayed": 55000, "6th-october": 38000, "new-capital": 42000,
  maadi: 70000, zamalek: 120000, heliopolis: 65000, "nasr-city": 45000, "north-coast": 85000, dokki: 68000,
};

/** Synthetic sample price levels (EGP per sqm). Scaled once so the sample portfolio sits near EGP 1bn. */
export const DISTRICT_PPSQM: Record<string, number> = Object.fromEntries(
  Object.entries(RAW_PPSQM).map(([k, v]) => [k, Math.round((v * 1.18) / 500) * 500]),
);

export const RISK_ASSUMPTIONS = {
  version: "1.1.0",
  note: "Composite 0-100 risk score from six drivers. Sample weights, not calibrated to any real portfolio.",
  weights: { vacancy: 0.25, leaseExpiry: 0.2, documents: 0.15, fx: 0.1, concentration: 0.1, valuePressure: 0.2 },
  vacancyFullScoreDays: 180,
  leaseExpiryFullScoreDays: 0,
  leaseExpiryZeroScoreDays: 365,
  documentPoints: { missing: 60, expired: 40, pending: 20 },
  fxUsdLeaseScore: 70,
  concentrationFloorShare: 0.12,
  concentrationFullShare: 0.3,
  bands: { low: 25, medium: 50 },
  // Scenario stress, used only when a scenario is applied (all zero in the base case).
  stress: { vacancyScorePerPoint: 2.5, fxScorePerUnitRatio: 200, fxScoreCap: 30, valuePressureScorePerUnitDrop: 400 },
} as const;


export const SCENARIO_ASSUMPTIONS = {
  version: "1.0.0",
  note: "Scenario coefficients: how interest rates, the pound, vacancy and rent growth move value, yield and risk. Sample values, not a forecast.",
  base: { fx: 50, rate: 24, vacancy: 0, rentGrowth: 8 },
  sliders: { fx: [40, 70], rate: [10, 35], vacancy: [0, 40], rentGrowth: [-5, 25] },
  // Market capitalisation rate by property type (decimal). Value moves inversely with the cap rate.
  capRateByType: { apartment: 0.072, villa: 0.058, office: 0.105, retail: 0.115, mixed: 0.095, land: 0.04 },
  capRatePassThrough: 0.15, // cap-rate points added per interest-rate point
  capFactorBounds: [0.6, 1.6],
  incomeWeight: { let: 0.5, vacant: 0, owner: 0, land: 0 }, // share of value tied to rental income
  rentGrowthPassThrough: 1.5,
  fxLinkage: { apartment: 0.15, villa: 0.25, office: 0.2, retail: 0.1, mixed: 0.15, land: 0.25 },
  usdLeaseLinkage: 0.8,
  cases: { low: { fx: -5, rate: 4, vacancy: 10, rentGrowth: -4 }, high: { fx: 5, rate: -3, vacancy: -5, rentGrowth: 3 } },
} as const;
export type ScenarioAssumptions = typeof SCENARIO_ASSUMPTIONS;

export const ALERT_ASSUMPTIONS = {
  version: "1.0.0",
  note: "Alert thresholds. Sample values.",
  leaseRenewalDays: 120, leaseHighDays: 45, leaseMediumDays: 90,
  valuationDriftPct: 8, valuationDriftHighPct: 12,
  vacancyDays: 60, vacancyMediumDays: 90, vacancyHighDays: 180,
  /** Who may see each kind. Vacancy cost and valuation drift reveal income or valuation work, so they are manager-only. */
  visibleTo: { lease_renewal: ["investor", "manager"], missing_document: ["investor", "manager"], valuation_drift: ["manager"], vacancy_cost: ["manager"] },
} as const;

/**
 * HORUS valuation, version 2: several explicit methods, reconciled. Every coefficient below is a SAMPLE assumption
 * for the demo, not a calibrated market figure. Changing any value means a new version string.
 */
export const HORUS_ASSUMPTIONS = {
  version: "HA-2.0.0",
  modelVersion: "HORUS-2.0.0",
  note: "Comparable sales with itemised adjustments, income capitalisation, depreciated cost and off-plan discounting. Sample coefficients.",
  comps: { count: 8, horizonMonths: 24, sizeElasticity: 0.08, evidenceWeight: { transaction: 1, signed: 0.85, asking: 0.6 }, askingToTransaction: -0.06, installmentsToCash: -0.08, otherDistrictPenalty: 0.6 },
  amenityPremium: { parking: 0.02, view: 0.04, garden: 0.03, pool: 0.04, security: 0.01, elevator: 0.01 },
  amenityCap: 0.1,
  clinicPremium: 0.05,
  income: { vacancy: { residential: 0.05, commercial: 0.1 }, opexShare: 0.12, rentGrowth: 0.08, exitCapUplift: 0.005, horizonYears: 5, discountUplift: 0.03 },
  cost: { replacementPerSqm: { core_shell: 12000, semi_finished: 19000, fully_finished: 27000, luxury: 40000 }, depreciationPerYear: 0.015, depreciationCap: 0.55, landFactor: 0.34 },
  offPlan: { annualDiscount: 0.12, installmentDiscount: 0.2 },
  weights: { comps: 0.6, compsThin: 0.3, income: 0.3, incomeCommercial: 0.4, costVilla: 0.25, costLand: 1, costOther: 0.1 },
  confidence: { highFrom: 70, mediumFrom: 45 },
  range: { base: 0.06, perPointBelow100: 0.0025, max: 0.3 },
  // Sample CPI path (index, January 2023 = 100) standing in for CAPMAS urban CPI until the import of stage 18.
  cpi: { source: "CAPMAS urban CPI (sample path, not the published series)", published: "2026-10-10", points: { "2023-01": 100, "2024-01": 132.5, "2025-01": 165.8, "2026-01": 187.4, "2026-10": 203.1 } },
} as const;
