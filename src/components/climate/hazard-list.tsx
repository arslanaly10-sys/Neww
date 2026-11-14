import { getTranslations } from "next-intl/server";
import type { assetClimate } from "@/lib/climate";
import { BAND, type Driver } from "@/lib/climate-rules";
import { DEMO_TODAY } from "@/lib/assumptions";
import { dateFmt } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge } from "../ui";
import { AssessHazard } from "./controls";

type Data = NonNullable<Awaited<ReturnType<typeof assetClimate>>>;
export const BAND_TONE = { high: "danger", medium: "gold", low: "ok" } as const;

/** Five dots, filled to the level; the level is also written out. */
export function LevelDots({ n, label }: { n: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex gap-0.5" aria-hidden="true">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={cn("size-2.5 rounded-full", i <= n ? (n >= 4 ? "bg-danger" : n === 3 ? "bg-gold-fill" : "bg-teal") : "bg-line")} />)}</span>
      <span>{label}</span>
    </span>
  );
}

/** One asset's exposure: each hazard's level, why, what reduces it, and any site assessment. */
export async function HazardList({ data, locale, assess }: { data: Data; locale: string; assess: boolean }) {
  const t = await getTranslations("climate");
  const ar = locale === "ar";
  const dr = (d: Driver) => t(`d_${d.key}`, d.params ?? {});
  return (
    <div className="space-y-4">
      <p className="text-sm">{t("overallIs", { level: t(`lv_${data.overall.level}`), hazards: data.overall.hazards.map((h) => t(`h_${h}`)).join(ar ? "، " : ", ") })}</p>
      <ul className="grid gap-3 lg:grid-cols-2" aria-label={t("hazards")}>
        {data.results.map((r) => {
          const what = t("whatFor", { hazard: t(`h_${r.hazard}`), asset: data.asset.id });
          return (
            <li key={r.hazard} className={cn("rounded-xl border bg-surface p-4 text-sm", r.residual >= 4 ? "border-danger/60" : "border-line")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-semibold">{t(`h_${r.hazard}`)}</h3>
                <Badge tone={BAND_TONE[BAND(r.residual)]}>{t(`band_${BAND(r.residual)}`)}</Badge>
              </div>
              <p className="mt-2"><LevelDots n={r.residual} label={t("levelOf", { level: t(`lv_${r.residual}`) })} /></p>
              {(r.override || r.residual !== r.level) && <p className="mt-1 text-xs text-muted">{r.override ? t("screenWas", { level: t(`lv_${r.screening}`) }) : ""}{r.override && r.residual !== r.level ? " " : ""}{r.residual !== r.level ? t("beforeWorks", { level: t(`lv_${r.level}`) }) : ""}</p>}
              {r.override ? (
                <div className="mt-3 rounded-lg bg-surface-2 p-3">
                  <p className="font-semibold">{t("siteAssessment", { method: t(`m_${r.override.method}`), date: dateFmt(r.override.assessedOn, locale) })}</p>
                  <p className="mt-1">{r.override.note}</p>
                </div>
              ) : (
                <ul className="mt-3 space-y-1" aria-label={t("driversOf", { hazard: t(`h_${r.hazard}`) })}>
                  {r.drivers.map((d) => <li key={d.key} className="flex flex-wrap items-baseline justify-between gap-x-3"><span>{dr(d)}</span><span className="text-xs text-muted">{t(`b_${d.basis}`)}</span></li>)}
                </ul>
              )}
              {r.mitigations.length > 0 && <p className="mt-2 text-xs">{t("works", { list: r.mitigations.map((m) => `${m.id} ${m.title} (${t(`ws_${m.status}`)})`).join(ar ? "، " : ", ") })}</p>}
              {assess && <div className="mt-3"><AssessHazard assetId={data.asset.id} hazard={r.hazard} what={what} screening={r.screening} today={DEMO_TODAY} documents={data.documents} /></div>}
            </li>
          );
        })}
      </ul>
      <p className="max-w-3xl text-xs text-muted">{t("method_note", { version: data.version, date: data.source ? dateFmt(data.source.retrievedAt, locale) : "–" })}</p>
      {data.history.length > 0 && (
        <details className="rounded-xl border border-line bg-surface p-4 text-sm">
          <summary className="min-h-10 cursor-pointer font-semibold">{t("history", { n: data.history.length })}</summary>
          <ul className="mt-2 divide-y divide-line">{data.history.map((h) => <li key={h.id} className="py-2">{h.id}: {t(`h_${h.hazard}`)}, {t(`lv_${h.level}`)}, {t(`m_${h.method}`)}<span className="block text-xs text-muted">{t("byOn", { who: ar ? h.recorderNameAr : h.recorderName, date: dateFmt(h.assessedOn, locale) })}{h.supersededAt ? `, ${t("replaced")}` : ""}</span></li>)}</ul>
        </details>
      )}
    </div>
  );
}
