"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { money, pct, type Currency, listSep } from "@/lib/format";

export interface MapDistrict { id: string; name: string; nameAr: string; lat: number; lng: number; value: number; share: number; count: number }
export interface MapAsset { id: string; name: string; nameAr: string; districtId: string; lat: number; lng: number; value: number }

/** Heat colour from portfolio share. Gold ramp; the legend states the same thresholds. */
const heat = (share: number, max: number) => 0.12 + 0.55 * (share / max);
const radius = () => 0.075;

/** Schematic placement, roughly by compass position and not to scale. Real centroids would crush Greater Cairo into one blob next to the far-away North Coast. */
const LAYOUT: Record<string, [number, number]> = {
  "north-coast": [30.5, 30.62], "sheikh-zayed": [30.3, 30.3], "6th-october": [30.3, 30.0],
  dokki: [30.65, 30.22], zamalek: [30.85, 30.4], maadi: [30.85, 30.05],
  heliopolis: [31.15, 30.4], "nasr-city": [31.15, 30.15], "new-cairo": [31.45, 30.05], "new-capital": [31.5, 30.4],
};
const BOUNDS: [[number, number], [number, number]] = [[30.08, 29.82], [31.72, 30.74]];

function circle(c: [number, number], steps = 28): [number, number][] {
  const r = radius();
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return [c[0] + (r * Math.cos(a)) / 0.87, c[1] + r * Math.sin(a)] as [number, number];
  });
}

/**
 * Schematic, tile-free map: hand-placed district discs and approximate asset points. It makes no network requests.
 * If WebGL is unavailable it falls back to the same data as an SVG, so the view always works.
 */
export function PortfolioMap({ districts, assets, currency, fx }: { districts: MapDistrict[]; assets: MapAsset[]; currency: Currency; fx: number }) {
  const t = useTranslations("pf");
  const locale = useLocale();
  const ar = locale === "ar";
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const maxShare = useMemo(() => Math.max(...districts.map((d) => d.share)), [districts]);
  const sel = assets.find((a) => a.id === selected) ?? null;
  const dPos = useMemo(() => Object.fromEntries(districts.map((d) => [d.id, LAYOUT[d.id] ?? [d.lng, d.lat]])) as Record<string, [number, number]>, [districts]);
  const aPos = useMemo(() => {
    const out: Record<string, [number, number]> = {};
    for (const d of districts) {
      const inD = assets.filter((a) => a.districtId === d.id).sort((a, b) => a.id.localeCompare(b.id));
      const c = dPos[d.id];
      inD.forEach((a, i) => {
        if (inD.length === 1) { out[a.id] = c; return; }
        const ang = (i / inD.length) * Math.PI * 2 - Math.PI / 2;
        out[a.id] = [c[0] + (0.042 * Math.cos(ang)) / 0.87, c[1] + 0.042 * Math.sin(ang)];
      });
    }
    return out;
  }, [assets, districts, dPos]);
  useEffect(() => {
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    let unwatch: (() => void) | undefined;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      if (cancelled || !ref.current) return;
      // MapLibre paints its layers from literal colours, so read the theme tokens from globals.css and repaint when the
      // colour scheme changes. The DOM labels and markers use the CSS variables directly and follow the theme on their own.
      const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      let m: import("maplibre-gl").Map;
      try {
        m = new maplibregl.Map({
          container: ref.current,
          style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": token("--surface-2") } }] },
          bounds: BOUNDS, fitBoundsOptions: { padding: 12 }, attributionControl: false, cooperativeGestures: true,
        });
      } catch { setFallback(true); return; }
      map = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), ar ? "top-left" : "top-right");
      m.on("load", () => {
        m.addSource("districts", {
          type: "geojson",
          data: { type: "FeatureCollection", features: districts.map((d) => ({ type: "Feature", properties: { id: d.id, heat: heat(d.share, maxShare) }, geometry: { type: "Polygon", coordinates: [circle(dPos[d.id])] } })) },
        });
        m.addLayer({ id: "d-fill", type: "fill", source: "districts", paint: { "fill-color": token("--gold-fill"), "fill-opacity": ["get", "heat"] } });
        m.addLayer({ id: "d-line", type: "line", source: "districts", paint: { "line-color": token("--gold-fill"), "line-width": 1, "line-opacity": 0.6 } });
        for (const d of districts) {
          const el = document.createElement("span");
          el.textContent = ar ? d.nameAr : d.name;
          el.style.cssText = `display:block;width:104px;text-align:center;font:600 12px/1.25 var(--font-sans, sans-serif);color:var(--text);text-shadow:0 0 3px var(--bg);pointer-events:none;margin-top:4px`;
          new maplibregl.Marker({ element: el, anchor: "top" }).setLngLat([dPos[d.id][0], dPos[d.id][1] - radius()]).addTo(m);
        }
        for (const a of assets) {
          const b = document.createElement("button");
          b.type = "button";
          b.setAttribute("aria-label", `${ar ? a.nameAr : a.name}`);
          b.style.cssText = "width:14px;height:14px;border-radius:50%;background:var(--gold-fill);border:2px solid var(--on-gold);cursor:pointer;padding:0";
          b.addEventListener("click", (e) => { e.stopPropagation(); setSelected(a.id); });
          new maplibregl.Marker({ element: b }).setLngLat(aPos[a.id]).addTo(m);
        }
      });
      const scheme = window.matchMedia("(prefers-color-scheme: dark)");
      const repaint = () => {
        if (!m.loaded()) return;
        m.setPaintProperty("bg", "background-color", token("--surface-2"));
        m.setPaintProperty("d-fill", "fill-color", token("--gold-fill"));
        m.setPaintProperty("d-line", "line-color", token("--gold-fill"));
      };
      scheme.addEventListener("change", repaint);
      unwatch = () => scheme.removeEventListener("change", repaint);
      m.on("error", (e) => { if (!m.loaded() && /worker|webgl/i.test(String(e.error?.message))) setFallback(true); });
    })().catch(() => setFallback(true));
    return () => { cancelled = true; unwatch?.(); map?.remove(); };
  }, [districts, assets, ar, maxShare, dPos, aPos]);

  const w = 640, h = 340, lngMin = BOUNDS[0][0], lngMax = BOUNDS[1][0], latMin = BOUNDS[0][1], latMax = BOUNDS[1][1];
  const X = (lng: number) => ((lng - lngMin) / (lngMax - lngMin)) * w, Y = (lat: number) => h - ((lat - latMin) / (latMax - latMin)) * h;

  return (
    <div>
      {fallback ? (
        <svg role="img" aria-label={t("mapLabel")} viewBox={`0 0 ${w} ${h}`} className="w-full rounded-md border border-line bg-surface-2" style={{ direction: "ltr" }}>
          {districts.map((d) => (
            <g key={d.id}>
              <circle cx={X(dPos[d.id][0])} cy={Y(dPos[d.id][1])} r={22} fill="var(--gold-fill)" fillOpacity={heat(d.share, maxShare)} stroke="var(--gold)" strokeOpacity={0.6} />
              <text x={X(dPos[d.id][0])} y={Y(dPos[d.id][1]) + 36} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text)">{ar ? d.nameAr : d.name}</text>
            </g>
          ))}
          {assets.map((a) => (
            <circle key={a.id} cx={X(aPos[a.id][0])} cy={Y(aPos[a.id][1])} r={5} fill="var(--gold-fill)" stroke="var(--bg)" strokeWidth={2} tabIndex={0} role="button" aria-label={ar ? a.nameAr : a.name} onClick={() => setSelected(a.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelected(a.id); }} />
          ))}
        </svg>
      ) : (
        <div ref={ref} role="region" aria-label={t("mapLabel")} dir="ltr" className="h-72 w-full overflow-hidden rounded-md border border-line md:h-96" />
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="flex"><span className="h-2.5 w-6 bg-gold-fill/20" /><span className="h-2.5 w-6 bg-gold-fill/45" /><span className="h-2.5 w-6 bg-gold-fill/70" /></span>
          {t("heatLegend", { lo: pct(Math.min(...districts.map((d) => d.share)), locale, 0), hi: pct(maxShare, locale, 0) })}
        </p>
        <p>{t("mapNote")}</p>
      </div>
      {sel && (
        <p className="mt-3 rounded-md border border-line bg-surface-2 p-3 text-sm" aria-live="polite">
          <Link href={`/asset/${sel.id}`} className="font-semibold text-gold underline underline-offset-4">{ar ? sel.nameAr : sel.name}</Link>
          {listSep(locale)}<bdi>{money(sel.value, currency, locale, { fx, compact: true })}</bdi>
        </p>
      )}
    </div>
  );
}
