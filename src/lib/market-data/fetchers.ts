import { z } from "zod";
import { WB_INDICATORS } from "./registry";

/**
 * Fetchers for the API sources: fetch, check the shape of what came back, and turn it into observations with their
 * provenance. No database here, so the snapshot script can use them too.
 */
export interface Obs { indicator: string; label: string; location: string; locationKind: "country" | "district" | "asset"; period: string; value: number; unit: string; currency?: string | null; transform: string }
export const LIC: Record<string, string> = { worldbank: "CC BY 4.0", worldpop: "CC BY 4.0", nasa_power: "NASA open data (cite NASA Langley POWER)", osm: "ODbL 1.0 (© OpenStreetMap contributors)", capmas_cpi: "CAPMAS terms (vary by dataset)", cbe_fx: "CBE terms of use" };

async function getJson(url: string, init: RequestInit = {}, ms = 90000) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms), headers: { "User-Agent": "zmnhoof-os-demo/1.0", ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
  return r.json();
}

/** World Bank indicators for Egypt. Indicators that do not answer are listed in `failed`; it throws only if none answer. */
export async function fetchWorldBank(): Promise<Obs[] & { failed?: string[] }> {
  const out: Obs[] & { failed?: string[] } = [];
  const failed: string[] = [];
  for (const ind of WB_INDICATORS) {
    try {
      const j = await getJson(`https://api.worldbank.org/v2/country/EGY/indicator/${ind.id}?format=json&per_page=100&date=2010:2026`, {}, 60000);
      const rows = z.tuple([z.unknown(), z.array(z.object({ date: z.string(), value: z.number().nullable() })).nullable()]).parse(j)[1] ?? [];
      for (const r of rows) if (r.value !== null) out.push({ indicator: ind.id, label: ind.label, location: "EGY", locationKind: "country", period: r.date, value: r.value, unit: ind.unit, currency: ind.currency ?? null, transform: "As published by the World Bank (annual); years without a value dropped." });
    } catch { failed.push(ind.id); }
  }
  if (!out.length) throw new Error(`The World Bank API did not answer (${failed.join(", ")})`);
  if (failed.length) out.failed = failed;
  return out;
}

export async function fetchWorldPop(points: { id: string; lat: number; lng: number }[], year = 2026): Promise<Obs[]> {
  const j = await getJson("https://api.worldpop.org/v3/catchment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: points.map((p) => ({ id: p.id, lon: p.lng, lat: p.lat })), radii_km: [1, 3], year }) });
  const res = z.object({ data_year: z.number(), points: z.array(z.object({ id: z.string(), rings: z.array(z.object({ to_km: z.number(), cumulative: z.number() })) })) }).parse(j);
  return res.points.flatMap((p) => p.rings.map((r) => ({ indicator: `pop_${r.to_km}km`, label: `People within ${r.to_km} km`, location: p.id, locationKind: "asset" as const, period: String(res.data_year), value: Math.round(r.cumulative), unit: "people",
    transform: `WorldPop Global2 R2025A 100 m grid, people within a ${r.to_km} km straight-line radius of the asset's recorded coordinates, rounded.` })));
}

export async function fetchNasaPower(points: { id: string; lat: number; lng: number }[]): Promise<Obs[]> {
  const out: Obs[] = [];
  for (const p of points) {
    const j = await getJson(`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN&community=RE&longitude=${p.lng}&latitude=${p.lat}&format=JSON`);
    const par = z.object({ properties: z.object({ parameter: z.record(z.string(), z.record(z.string(), z.number())) }) }).parse(j).properties.parameter;
    const period = "long-term average";
    out.push({ indicator: "temp_avg", label: "Average temperature", location: p.id, locationKind: "district", period, value: par.T2M.ANN, unit: "°C", transform: "NASA POWER climatology at the district centre, annual mean of T2M." });
    out.push({ indicator: "rain_year", label: "Rainfall", location: p.id, locationKind: "district", period, value: Math.round(par.PRECTOTCORR.ANN * 365 * 10) / 10, unit: "mm a year", transform: "NASA POWER PRECTOTCORR annual mean (mm a day) × 365." });
    out.push({ indicator: "solar", label: "Solar radiation", location: p.id, locationKind: "district", period, value: par.ALLSKY_SFC_SW_DWN.ANN, unit: "kWh/m² a day", transform: "NASA POWER ALLSKY_SFC_SW_DWN annual mean." });
  }
  return out;
}

export const OSM_CATEGORIES: { id: string; filter: string }[] = [
  { id: "schools", filter: 'nwr(around:1000,LAT,LNG)["amenity"~"^(school|kindergarten|college|university)$"]' },
  { id: "health", filter: 'nwr(around:1000,LAT,LNG)["amenity"~"^(hospital|clinic|doctors)$"]' },
  { id: "pharmacies", filter: 'nwr(around:1000,LAT,LNG)["amenity"="pharmacy"]' },
  { id: "supermarkets", filter: 'nwr(around:1000,LAT,LNG)["shop"~"^(supermarket|convenience)$"]' },
  { id: "banks", filter: 'nwr(around:1000,LAT,LNG)["amenity"~"^(bank|atm)$"]' },
  { id: "food", filter: 'nwr(around:1000,LAT,LNG)["amenity"~"^(restaurant|cafe|fast_food)$"]' },
  { id: "bus_stops", filter: 'node(around:1000,LAT,LNG)["highway"="bus_stop"]' },
];
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

export async function fetchOsm(points: { id: string; lat: number; lng: number }[]): Promise<Obs[]> {
  const out: Obs[] = [];
  for (const p of points) {
    const q = `[out:json][timeout:25];${OSM_CATEGORIES.map((c) => `${c.filter.replace("LAT", String(p.lat)).replace("LNG", String(p.lng))};out count;`).join("")}`;
    let j: unknown = null, lastErr = "";
    for (const url of OVERPASS) {
      try { j = await getJson(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(q)}` }, 30000); break; } catch (e) { lastErr = (e as Error).message; }
    }
    if (!j) throw new Error(`No Overpass server answered (${lastErr})`);
    const els = z.object({ elements: z.array(z.object({ tags: z.object({ total: z.string() }) })) }).parse(j).elements;
    OSM_CATEGORIES.forEach((c, i) => out.push({ indicator: `osm_${c.id}`, label: c.id, location: p.id, locationKind: "asset", period: new Date().toISOString().slice(0, 10), value: Number(els[i]?.tags.total ?? 0), unit: "within 1 km", transform: "Count of OpenStreetMap features within a 1 km straight-line radius; coverage in OpenStreetMap varies by area." }));
  }
  return out;
}

