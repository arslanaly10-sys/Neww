import { getTranslations } from "next-intl/server";
import { CheckCircle2, CircleSlash, Info } from "lucide-react";
import type { Intake, RunResult } from "@/lib/horus-engine";
import { dateFmt, int, listSep, money, pct } from "@/lib/format";
import { SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { cn } from "@/lib/cn";
import { Badge } from "../ui";
import { ConfidenceDial, RangeBar } from "./visuals";

const ADJ = ["time", "location", "size", "condition", "age", "floor", "terms", "asking"] as const;
const signed = (x: number, locale: string) => `${x > 0 ? "+" : ""}${pct(x / 100, locale, 1)}`;
const monthsBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / (30.4375 * 86400000));

/**
 * The HORUS report: the range and most likely value, how sure it is and why, each method's workings, the comparables
 * with every adjustment, the other currency and inflation views clearly labelled, the sources with their dates, and
 * the limits. Everything shown is computed by the engine; nothing here is generated text.
 */
export async function HorusReport({ r, inputs, status, locale, currency, districtName, publicView = false }: { r: RunResult; inputs: Intake; status: string; locale: string; currency: "EGP" | "USD"; districtName: (id: string) => string; publicView?: boolean }) {
  const t = await getTranslations("hv");
  const E = (n: number) => money(n, "EGP", locale);
  const M = (n: number) => money(n, currency, locale, { fx: SAMPLE_FX_EGP_PER_USD });
  const sep = listSep(locale);
  const main = [...r.methods].filter((m) => m.weight > 0).sort((a, b) => b.weight - a.weight);
  const ev = r.evidence;
  const statusTone = status === "signed_off" ? "ok" : status === "returned" ? "danger" : "gold";
  const W = (m: RunResult["methods"][number]) => Object.entries(m.workings).filter(([, v]) => v !== null && v !== "");
  const fmtWork = (k: string, v: number | string | null) => typeof v === "number" ? (/Pct$/.test(k) ? pct(v / 100, locale, 1) : /(Sqm|monthsToHandover|comps)$/.test(k) ? int(v, locale) : M(v)) : String(v);

  return (
    <div className="space-y-8">
      <section aria-labelledby="hv-range" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={statusTone}>{t(`st_${status}` as "st_illustrative")}</Badge><span className="text-xs text-muted">{t("asOf", { date: dateFmt(r.asOf, locale), model: r.modelVersion, assumptions: r.assumptionsVersion })}</span></div>
          <h2 id="hv-range" className="font-display text-3xl md:text-4xl"><span className="num">{M(r.lowEgp)}</span> {t("to")} <span className="num">{M(r.highEgp)}</span></h2>
          <p className="text-lg">{t("mostLikely")} <span className="num font-semibold text-gold">{M(r.valueEgp)}</span></p>
          <RangeBar low={r.lowEgp} high={r.highEgp} value={r.valueEgp} paid={inputs.purchasePriceEgp} labels={{ low: M(r.lowEgp), high: M(r.highEgp), value: M(r.valueEgp), paid: inputs.purchasePriceEgp ? t("paidMarker", { amount: M(inputs.purchasePriceEgp), date: inputs.purchaseDate ? dateFmt(inputs.purchaseDate, locale) : "" }) : undefined }} />
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-line p-4">
          <ConfidenceDial score={r.confidence.score} level={r.confidence.level} label={t(`lv_${r.confidence.level}`)} />
          <div className="max-w-56 text-sm"><p className="font-semibold">{t("confidence")}</p><p className="text-muted">{t("confidenceHelp")}</p></div>
        </div>
      </section>

      <section aria-labelledby="hv-why" className="space-y-3">
        <h3 id="hv-why" className="font-display text-2xl">{t("why")}</h3>
        <ul className="space-y-2 text-sm">
          {main.length > 0 && <li>{t("sMethods", { list: main.map((m) => `${t(`m_${m.id}`)} (${pct(m.weight, locale, 0)})`).join(sep) })}</li>}
          {ev.n > 0 && <li>{t("sEvidence", { n: ev.n, transaction: ev.transaction, signed: ev.signed, asking: ev.asking, months: ev.medianMonths ?? 0 })}</li>}
          {r.drivers.length > 0 && <li>{t("sDrivers", { list: r.drivers.slice(0, 3).map((d) => `${t(`a_${d.key}`)} ${signed(d.pct, locale)}`).join(sep) })}</li>}
          {r.confidence.factors.length > 0 && <li>{t("sLower", { list: r.confidence.factors.map((f) => t(`cf_${f.id}`, f.params ?? {})).join(sep) })}</li>}
        </ul>
      </section>

      <section aria-labelledby="hv-methods" className="space-y-3">
        <h3 id="hv-methods" className="font-display text-2xl">{t("methods")}</h3>
        <ul className="grid gap-3 md:grid-cols-2">
          {r.methods.map((m) => (
            <li key={m.id} className={cn("rounded-lg border p-4 text-sm", m.weight > 0 ? "border-gold-fill/60" : "border-line")}>
              <p className="flex items-center justify-between gap-2 font-semibold">{t(`m_${m.id}`)}{m.weight > 0 ? <span className="num text-gold">{pct(m.weight, locale, 0)}</span> : null}</p>
              <p className="mt-1 text-muted">{t(`mh_${m.id}`)}</p>
              {m.valueEgp !== null ? <p className="mt-2 flex items-center gap-1.5">{m.weight > 0 ? <CheckCircle2 aria-hidden="true" size={15} className="text-ok" /> : <Info aria-hidden="true" size={15} className="text-muted" />}<span className="num font-semibold">{M(m.valueEgp)}</span>{m.weight === 0 && m.reason ? <span className="text-xs text-muted">{sep}{t(`r_${m.reason}`)}</span> : null}</p>
                : <p className="mt-2 flex items-center gap-1.5 text-muted"><CircleSlash aria-hidden="true" size={15} />{t(`r_${m.reason ?? "noComps"}`)}</p>}
              {W(m).length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gold underline underline-offset-4">{t("workings")}</summary>
                  <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
                    {W(m).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{t.has(`w_${k}`) ? t(`w_${k}` as "w_noi") : k}</dt><dd className="num text-end">{fmtWork(k, v)}</dd></div>)}
                  </dl>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>

      {r.comps.length > 0 && (
        <section aria-labelledby="hv-comps" className="space-y-3">
          <h3 id="hv-comps" className="font-display text-2xl">{t("comps")}</h3>
          <p className="max-w-2xl text-sm text-muted">{t("compsLead")}</p>
          <div role="region" aria-label={t("compsTable")} tabIndex={0} className="overflow-x-auto rounded-lg border border-line focus-visible:outline-2 focus-visible:outline-gold-fill">
            <table className="w-full min-w-[64rem] text-xs">
              <caption className="sr-only">{t("comps")}</caption>
              <thead><tr className="text-muted">
                <th scope="col" className="px-3 py-2 text-start font-semibold">{t("cSale")}</th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">{t("cEvidence")}</th>
                <th scope="col" className="px-3 py-2 text-end font-semibold">{t("cPpsqm")}</th>
                {ADJ.map((a) => <th key={a} scope="col" className="px-2 py-2 text-end font-semibold">{t(`a_${a}`)}</th>)}
                <th scope="col" className="px-3 py-2 text-end font-semibold">{t("cAdjusted")}</th>
                <th scope="col" className="px-3 py-2 text-end font-semibold">{t("cWeight")}</th>
              </tr></thead>
              <tbody>
                {r.comps.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <th scope="row" className="px-3 py-2 text-start font-normal"><span className="num">{c.id}</span><span className="block text-muted">{districtName(c.districtId)}{sep}<span className="num">{int(c.areaSqm, locale)} m²</span>{sep}{dateFmt(c.soldOn, locale)}</span></th>
                    <td className="px-3 py-2"><Badge tone={c.evidenceKind === "transaction" ? "ok" : c.evidenceKind === "signed" ? "teal" : "gold"}>{t(`ev_${c.evidenceKind}` as "ev_asking")}</Badge>{c.paymentTerms === "installments" && <span className="block text-muted">{t("onInstalments")}</span>}</td>
                    <td className="px-3 py-2 text-end"><span className="num">{E(c.ppsqm)}</span></td>
                    {ADJ.map((a) => <td key={a} className={cn("px-2 py-2 text-end", c.adjustments[a] === 0 && "text-muted")}><span className="num">{c.adjustments[a] === 0 ? "–" : signed(c.adjustments[a] * 100, locale)}</span></td>)}
                    <td className="px-3 py-2 text-end font-semibold"><span className="num">{E(c.adjustedPpsqm)}</span></td>
                    <td className="px-3 py-2 text-end"><span className="num">{c.weight.toFixed(2)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">{t("compsNote")}</p>
        </section>
      )}

      <section aria-labelledby="hv-views" className="space-y-3">
        <h3 id="hv-views" className="font-display text-2xl">{t("views")}</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg border border-gold-fill/60 p-3"><dt className="text-muted">{t("vNominal")}</dt><dd className="num text-lg font-semibold">{E(r.valueEgp)}</dd><dd className="text-xs text-muted">{t("vNominalHelp")}</dd></div>
          <div className="rounded-lg border border-line p-3"><dt className="text-muted">{t("vUsd")}</dt><dd className="num text-lg">{money(r.views.usd.value, "USD", locale)}</dd><dd className="text-xs text-muted">{t("vUsdHelp", { rate: r.views.usd.rate })}</dd></div>
          <div className="rounded-lg border border-line p-3"><dt className="text-muted">{t("vReal", { month: r.views.real.baseMonth })}</dt><dd className="num text-lg">{E(r.views.real.valueEgp)}</dd><dd className="text-xs text-muted">{t("vRealHelp", { source: r.views.real.source, date: dateFmt(r.views.real.published, locale) })}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="hv-sources" className="space-y-3">
        <h3 id="hv-sources" className="font-display text-2xl">{t("sources")}</h3>
        <ul className="divide-y divide-line rounded-lg border border-line text-sm">
          {r.sources.map((s) => {
            const age = s.date ? monthsBetween(s.date, r.asOf) : null;
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span><span className="font-medium">{s.label}</span><span className="block text-xs text-muted">{t(`sk_${s.kind}` as "sk_index")}</span></span>
                <span className="text-xs text-muted">{s.date ? t("sourceDate", { date: dateFmt(s.date, locale), age: age ?? 0 }) : t("noDate")}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="hv-limits" className="rounded-xl border border-line bg-surface-2/40 p-4 text-sm">
        <h3 id="hv-limits" className="mb-2 font-semibold">{t("limits")}</h3>
        <ul className="list-disc space-y-1 ps-5 text-muted">
          <li>{publicView ? t("limitPublic") : t("limitInternal")}</li>
          <li>{t("limitSample")}</li>
          <li>{t("limitAsking")}</li>
          <li>{t("limitAi")}</li>
        </ul>
      </section>
    </div>
  );
}
