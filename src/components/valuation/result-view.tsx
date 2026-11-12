"use client";
import { useLocale, useTranslations } from "next-intl";
import { int, money, pct, type Currency, dateFmt, listSep, rangeSep } from "@/lib/format";
import { Badge, Card } from "../ui";
import type { ValuationResult } from "@/lib/valuation";
import { Fig } from "../fig";

/** Read-only presentation of an engine result: range, estimate, confidence, drivers, comparables, assumptions. */
export function ResultView({ r, currency, fx, districtName }: { r: ValuationResult; currency: Currency; fx: number; districtName: string }) {
  const t = useTranslations("val");
  const ty = useTranslations("types");
  const fi = useTranslations("finish");
  const locale = useLocale();
  const ar = locale === "ar";
  const f = (v: number, o: { compact?: boolean } = {}) => money(v, currency, locale, { fx, ...o });
  const span = r.highEgp - r.lowEgp || 1;
  const pos = ((r.estimateEgp - r.lowEgp) / span) * 100;
  const tone = { high: "ok", medium: "gold", low: "danger" } as const;
  const driverLabel = (k: string) => t(`d_${k}` as "d_base");
  const maxAbs = Math.max(...r.drivers.slice(1).map((d) => Math.abs(d.deltaEgp)), 1);

  return (
    <div className="space-y-6" aria-live="polite">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-muted">{t("modelEstimate")}</p>
            <p className="font-display text-4xl leading-tight">
              <Fig label={t("modelEstimate")} value={f(r.estimateEgp)} source={t("estimateSrc", { id: r.assumptionSetId })} assumptions={r.assumptionSetId}
                calc={r.drivers.map((d) => (d.factor === null ? `${int(r.inputs.areaSqm, locale)} × ${int(r.basePpsqm, locale)}` : `× ${d.factor.toFixed(3)}`)).join(" ")} />
            </p>
          </div>
          <div className="text-end">
            <p className="text-xs font-semibold text-muted">{t("confidence")}</p>
            <Badge tone={tone[r.confidence.level]} className="mt-1 text-xs">{t(`conf_${r.confidence.level}` as "conf_high")}</Badge>
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-2 text-sm text-muted">{t("range")}: <bdi className="text-text">{f(r.lowEgp)}</bdi>{rangeSep(locale)}<bdi className="text-text">{f(r.highEgp)}</bdi> <span className="text-xs">(± <bdi>{r.spreadPct}%</bdi>)</span></p>
          <div dir="ltr" role="img" aria-label={`${t("range")}: ${f(r.lowEgp)}${rangeSep(locale)}${f(r.highEgp)}; ${t("modelEstimate")} ${f(r.estimateEgp)}`} className="relative h-3 rounded-full bg-surface-2">
            <div className="absolute inset-y-0 start-0 end-0 rounded-full bg-gold-fill/30" />
            <div className="absolute -top-1.5 h-6 w-0.5 bg-gold" style={{ left: `${pos}%` }} />
          </div>
          <div dir="ltr" className="mt-1 flex justify-between text-[11px] text-muted"><span>{f(r.lowEgp, { compact: true })}</span><span>{f(r.highEgp, { compact: true })}</span></div>
        </div>

        <ul className="mt-5 space-y-1 text-sm text-muted">
          {r.confidence.reasons.map((x) => <li key={x.id}>• {t(`cr_${x.id}` as "cr_compCount", x.params as Record<string, string | number>)}</li>)}
        </ul>
        {r.compsImpliedEgp !== null && r.driftVsCompsPct !== null && (
          <p className="mt-4 rounded-md border border-line bg-surface-2 p-3 text-sm">
            {t("crossCheck", { value: f(r.compsImpliedEgp), drift: pct(r.driftVsCompsPct / 100, locale) })}
          </p>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-xl">{t("drivers")}</h3>
        <ol className="space-y-3">
          {r.drivers.map((d, i) => (
            <li key={d.key} className="text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{driverLabel(d.key)}</span>
                <span className="text-muted">
                  {d.factor === null ? <bdi>{int(r.inputs.areaSqm, locale)} {t("sqm")} × {f(r.basePpsqm)}</bdi> : <><bdi>× {d.factor.toFixed(3)}</bdi>{listSep(locale)}<bdi>{d.deltaEgp >= 0 ? "+" : "−"}{f(Math.abs(d.deltaEgp), { compact: true })}</bdi></>}
                  {" → "}<bdi className="text-text">{f(d.valueAfterEgp, { compact: true })}</bdi>
                </span>
              </div>
              {i > 0 && <div aria-hidden="true" className="mt-1 h-1.5 rounded-full bg-surface-2"><div className={`h-1.5 rounded-full ${d.deltaEgp >= 0 ? "bg-gold-fill" : "bg-danger"}`} style={{ width: `${Math.min(100, (Math.abs(d.deltaEgp) / maxAbs) * 100)}%` }} /></div>}
              <p className="mt-0.5 text-xs text-muted">{t((d.key === "floor" && (r.inputs.type === "villa" || r.inputs.type === "land") ? "dx_floor_na" : `dx_${d.key}`) as "dx_base", { district: districtName, type: ty(r.inputs.type), finish: fi(r.inputs.finish), age: r.inputs.buildingAge ?? 0, floor: r.inputs.floor ?? 0, market: r.marketFactor.toFixed(3) })}</p>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <h3 className="mb-1 font-display text-xl">{t("comps")}</h3>
        <p className="mb-3 text-xs text-muted">{t("compsNote")}</p>
        {r.comps.length === 0 ? <p className="text-sm text-muted">{t("noComps", { type: ty(r.inputs.type) })}</p> : (
          <>
            <ul className="space-y-3 md:hidden">
              {r.comps.map((c) => (
                <li key={c.id} className="rounded-md border border-line p-3 text-sm">
                  <p className="flex justify-between"><span className="num font-semibold text-gold">{c.id}</span><bdi>{f(c.priceEgp, { compact: true })}</bdi></p>
                  <p className="text-xs text-muted"><bdi>{dateFmt(c.soldOn, locale)}</bdi>{listSep(locale)}<bdi>{int(c.areaSqm, locale)}</bdi> {t("sqm")}{listSep(locale)}{fi(c.finish as "luxury")}{listSep(locale)}{t("similarity")} <bdi>{pct(c.similarity, locale, 0)}</bdi></p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-hidden rounded-md border border-line md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("comps")}</caption>
                <thead className="bg-surface-2 text-xs text-muted">
                  <tr>{["colSale", "colSold", "colArea", "colFinish", "colPrice", "colAdj", "similarity"].map((k, i) => <th key={k} scope="col" className={`px-3 py-2 font-semibold ${i >= 4 ? "text-end" : "text-start"}`}>{t(k as "colSale")}</th>)}</tr>
                </thead>
                <tbody>
                  {r.comps.map((c) => (
                    <tr key={c.id} className="border-t border-line">
                      <td className="px-3 py-2"><span className="num font-semibold text-gold">{c.id}</span>{!c.sameDistrict && <span className="ms-1 text-xs text-muted">{t("otherDistrict")}</span>}</td>
                      <td className="px-3 py-2"><bdi>{dateFmt(c.soldOn, locale)}</bdi></td>
                      <td className="px-3 py-2"><bdi>{int(c.areaSqm, locale)}</bdi> {t("sqm")}</td>
                      <td className="px-3 py-2">{fi(c.finish as "luxury")}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-end"><bdi>{f(c.priceEgp)}</bdi></td>
                      <td className="whitespace-nowrap px-3 py-2 text-end"><bdi>{f(c.adjustedBasePpsqm)}</bdi></td>
                      <td className="px-3 py-2 text-end"><bdi>{pct(c.similarity, locale, 0)}</bdi></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="mt-3 text-xs text-muted">{t("assumptionLine", { id: r.assumptionSetId, date: dateFmt(r.asOf, locale) })}</p>
      </Card>
    </div>
  );
}
