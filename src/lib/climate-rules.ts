/**
 * Climate and physical-hazard screening for one asset. Pure and deterministic: inputs are observed climate figures
 * (NASA POWER, per district), sample site attributes per district (stated as assumptions, not surveys), the asset's
 * own record (age, floor, type) and adaptation works from capital works. Each hazard gets a level from 1 (very low)
 * to 5 (very high) with the drivers that produced it. A site-specific assessment, when recorded, replaces the
 * screening level and says so. This is a screening tool, not an engineering or insurance assessment.
 */
export const HAZARDS = ["heat", "flood", "coastal", "seismic", "dust"] as const;
export type Hazard = (typeof HAZARDS)[number];
export const CLIMATE_VERSION = "CLIM-1.0.0";

export type FloodSetting = "desert_wadi" | "nile_valley" | "urban_plain" | "coastal";
export interface SiteAttrs { coastKm: number; flood: FloodSetting; urbanHeat: "high" | "medium" | "low"; desertEdge: boolean; seismicZone: "moderate" | "low" }

/** Sample site attributes per district. Assumptions for this demo, written from general knowledge of each area. */
export const DISTRICT_SITE: Record<string, SiteAttrs> = {
  "new-cairo": { coastKm: 190, flood: "desert_wadi", urbanHeat: "medium", desertEdge: true, seismicZone: "moderate" },
  "sheikh-zayed": { coastKm: 175, flood: "desert_wadi", urbanHeat: "medium", desertEdge: true, seismicZone: "moderate" },
  "6th-october": { coastKm: 180, flood: "desert_wadi", urbanHeat: "medium", desertEdge: true, seismicZone: "moderate" },
  "new-capital": { coastKm: 200, flood: "desert_wadi", urbanHeat: "low", desertEdge: true, seismicZone: "moderate" },
  maadi: { coastKm: 195, flood: "nile_valley", urbanHeat: "medium", desertEdge: false, seismicZone: "moderate" },
  zamalek: { coastKm: 180, flood: "nile_valley", urbanHeat: "high", desertEdge: false, seismicZone: "moderate" },
  heliopolis: { coastKm: 175, flood: "urban_plain", urbanHeat: "high", desertEdge: false, seismicZone: "moderate" },
  "nasr-city": { coastKm: 180, flood: "urban_plain", urbanHeat: "high", desertEdge: false, seismicZone: "moderate" },
  "north-coast": { coastKm: 1, flood: "coastal", urbanHeat: "low", desertEdge: true, seismicZone: "low" },
  dokki: { coastKm: 180, flood: "nile_valley", urbanHeat: "high", desertEdge: false, seismicZone: "moderate" },
};

export interface ClimateObs { tempMax: number | null; tempAvg: number | null; rainWettest: number | null; wind: number | null; elevation: number | null; solar: number | null }
export interface AssetIn { type: string; floor: number | null; yearBuilt: number | null; status: string }
export interface Mitigation { id: string; category: string; status: string; title: string }
export interface Override { id: string; hazard: string; level: number; method: string; note: string; assessedOn: string }

export type Driver = { key: string; params?: Record<string, string | number>; basis: "observed" | "assumption" | "record" | "works"; delta: number };
export interface HazardResult { hazard: Hazard; screening: number; level: number; residual: number; drivers: Driver[]; mitigations: Mitigation[]; override: Override | null; confidence: "low" | "medium" }

const clamp = (n: number) => Math.max(1, Math.min(5, n));

/** Which capital works reduce which hazard, once in progress or done. */
export const MITIGATES: Record<string, Hazard[]> = { solar: ["heat"], mep: ["heat"], roof: ["flood", "heat"], landscape: ["flood"], facade: ["dust"] };

export function screen(asset: AssetIn, site: SiteAttrs, o: ClimateObs, works: Mitigation[] = [], overrides: Override[] = []): HazardResult[] {
  const ground = asset.type !== "land" && (asset.floor === null || asset.floor <= 0 || asset.type === "villa" || asset.type === "retail");
  const out: Record<Hazard, Driver[]> = { heat: [], flood: [], coastal: [], seismic: [], dust: [] };

  // Heat: the hottest days observed, raised where dense surroundings hold heat.
  const tm = o.tempMax;
  out.heat.push(tm === null ? { key: "noData", basis: "observed", delta: 3 } : { key: "tempMax", params: { v: tm.toFixed(1) }, basis: "observed", delta: tm >= 46 ? 4 : tm >= 43 ? 3 : tm >= 38 ? 2 : 1 });
  if (site.urbanHeat === "high") out.heat.push({ key: "urbanHeat", basis: "assumption", delta: 1 });
  if (site.urbanHeat === "low") out.heat.push({ key: "coolSetting", basis: "assumption", delta: -1 });
  if (asset.type === "land") out.heat.push({ key: "noBuilding", basis: "record", delta: -2 });

  // Flood from heavy rain: rare here, but drainage is built for little rain and desert towns sit on wadi paths.
  out.flood.push(o.rainWettest === null ? { key: "noData", basis: "observed", delta: 2 } : { key: "rainWettest", params: { v: Math.round(o.rainWettest) }, basis: "observed", delta: o.rainWettest >= 30 ? 2 : 1 });
  out.flood.push({ key: `setting_${site.flood}`, basis: "assumption", delta: site.flood === "desert_wadi" ? 2 : 1 });
  if (ground) out.flood.push({ key: "groundLevel", basis: "record", delta: 1 });

  // Coastal flooding and sea-level rise: only near the coast and on low ground.
  if (site.coastKm <= 10) {
    out.coastal.push({ key: "nearCoast", params: { km: site.coastKm }, basis: "assumption", delta: site.coastKm <= 2 ? 3 : 2 });
    if (o.elevation !== null && o.elevation < 30) out.coastal.push({ key: "lowGround", params: { m: o.elevation }, basis: "observed", delta: 1 });
  } else out.coastal.push({ key: "inland", params: { km: site.coastKm }, basis: "assumption", delta: 1 });

  // Earthquakes: the regional setting, raised for older structures designed before modern seismic provisions.
  out.seismic.push({ key: `zone_${site.seismicZone}`, basis: "assumption", delta: site.seismicZone === "moderate" ? 2 : 1 });
  if (asset.type !== "land" && asset.yearBuilt !== null && asset.yearBuilt < 1995) out.seismic.push({ key: "olderStructure", params: { year: asset.yearBuilt }, basis: "record", delta: 1 });

  // Dust and sand: desert edges and windy places.
  out.dust.push({ key: site.desertEdge ? "desertEdge" : "builtUp", basis: "assumption", delta: site.desertEdge ? 3 : 2 });
  if (o.wind !== null && o.wind >= 3.5) out.dust.push({ key: "windy", params: { v: o.wind.toFixed(1) }, basis: "observed", delta: 1 });

  return HAZARDS.map((h) => {
    const screening = clamp(out[h].reduce((s, d) => s + d.delta, 0));
    const ov = overrides.filter((x) => x.hazard === h).sort((a, b) => b.assessedOn.localeCompare(a.assessedOn))[0] ?? null;
    const level = ov ? clamp(ov.level) : screening;
    const mits = asset.type === "land" ? [] : works.filter((w) => (w.status === "done" || w.status === "in_progress") && (MITIGATES[w.category] ?? []).includes(h));
    const residual = clamp(level - (mits.some((m) => m.status === "done") ? 1 : 0));
    return { hazard: h, screening, level, residual, drivers: out[h], mitigations: mits, override: ov, confidence: ov ? "medium" : "low" };
  });
}

/** The overall picture: the highest residual level, and which hazards reach it. */
export function overall(results: HazardResult[]) {
  const top = Math.max(...results.map((r) => r.residual));
  return { level: top, hazards: results.filter((r) => r.residual === top).map((r) => r.hazard) };
}
export const BAND = (n: number) => (n >= 4 ? "high" : n === 3 ? "medium" : "low") as "high" | "medium" | "low";
