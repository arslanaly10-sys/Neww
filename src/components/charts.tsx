"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { money, pct, type Currency } from "@/lib/format";

export interface HistPoint { month: string; value: number; cost: number }

const useReducedMotion = () => {
  const [r, setR] = useState(true);
  useEffect(() => { setR(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  return r;
};
const fmtMonth = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(iso));

/**
 * 36-month value chart. Scrub with mouse, finger or the arrow keys; the readout above the chart states the figures
 * for the selected month, so nothing depends on hover. Time runs left to right in both languages.
 */
export function ValueChart({ data, currency, fx, label, costLabel }: { data: HistPoint[]; currency: Currency; fx: number; label: string; costLabel: string }) {
  const t = useTranslations("pf");
  const locale = useLocale();
  const reduced = useReducedMotion();
  const [idx, setIdx] = useState(data.length - 1);
  const wrap = useRef<HTMLDivElement>(null);
  const liveId = useId();
  const f = useCallback((egp: number, compact = false) => money(egp, currency, locale, { fx, compact }), [currency, locale, fx]);
  const rows = useMemo(() => data.map((d) => ({ ...d, label: fmtMonth(d.month, locale) })), [data, locale]);
  const sel = rows[idx];
  const first = rows.find((r) => r.value > 0) ?? rows[0];
  const prev = rows[Math.max(0, idx - 1)];
  const sinceStart = first.value ? sel.value / first.value - 1 : 0;
  const mom = prev.value ? sel.value / prev.value - 1 : 0;

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 6 : 1;
    if (e.key === "ArrowRight") setIdx((i) => Math.min(rows.length - 1, i + step));
    else if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - step));
    else if (e.key === "Home") setIdx(0);
    else if (e.key === "End") setIdx(rows.length - 1);
    else return;
    e.preventDefault();
  };
  const min = Math.min(...rows.map((r) => r.value).filter(Boolean), ...rows.map((r) => r.cost).filter(Boolean)), max = Math.max(...rows.map((r) => r.cost), ...rows.map((r) => r.value));

  return (
    <div>
      <div id={liveId} aria-live="polite" className="mb-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <p><span className="block text-xs text-muted">{t("month")}</span><span className="font-semibold">{sel.label}</span></p>
        <p><span className="block text-xs text-muted">{label}</span><bdi className="font-display text-xl">{f(sel.value)}</bdi></p>
        <p><span className="block text-xs text-muted">{costLabel}</span><bdi>{f(sel.cost)}</bdi></p>
        <p><span className="block text-xs text-muted">{t("change")}</span><bdi>{pct(sinceStart, locale)}</bdi> <span className="text-xs text-muted">{t("sinceStart")}</span><br /><bdi className="text-xs text-muted">{pct(mom, locale)} {t("vsPrev")}</bdi></p>
      </div>
      <div
        ref={wrap} dir="ltr" tabIndex={0} role="group" aria-describedby={liveId}
        aria-label={`${label}. ${t("scrubHelp")}`} onKeyDown={onKey}
        className="h-64 w-full rounded-md outline-offset-4 md:h-80"
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            onMouseMove={(s) => { const raw = (s as { activeTooltipIndex?: number | string }).activeTooltipIndex; const i = raw === undefined || raw === null ? NaN : Number(raw); if (Number.isInteger(i) && i >= 0 && i < rows.length) setIdx(i); }}
            onMouseLeave={() => setIdx(rows.length - 1)}>
                        <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval={5} />
            <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={64} domain={[Math.floor(min * 0.9), Math.ceil(max * 1.05)]}
              tickFormatter={(v: number) => { const c = money(v, currency, "en", { fx, compact: true }); return c.replace(/(EGP|USD) /, ""); }} />
            <Tooltip content={() => null} cursor={{ stroke: "var(--gold)", strokeWidth: 1 }} />
            <Area type="monotone" dataKey="value" stroke="var(--gold)" strokeWidth={2} fill="var(--gold-fill)" fillOpacity={0.12} isAnimationActive={!reduced} dot={false} activeDot={{ r: 4, fill: "var(--gold)" }} />
            <Line type="stepAfter" dataKey="cost" stroke="var(--teal)" strokeWidth={1.6} strokeDasharray="5 4" dot={false} isAnimationActive={!reduced} />
            <ReferenceLine x={sel.label} stroke="var(--gold)" strokeDasharray="2 3" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-5 bg-gold" />{label}</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-5 border-t-2 border-dashed border-teal" />{costLabel}</span>
        <span>{t("scrubHelp")}</span>
      </p>
    </div>
  );
}

export interface CashPoint { month: string; income: number; costs: number }
/** Income above the axis, costs below. Figures shown in the table beneath the chart in the asset page. */
export function IncomeChart({ data, currency, fx, incomeLabel, costLabel }: { data: CashPoint[]; currency: Currency; fx: number; incomeLabel: string; costLabel: string }) {
  const locale = useLocale();
  const reduced = useReducedMotion();
  const rows = data.map((d) => ({ ...d, label: fmtMonth(d.month, locale), costs: -Math.abs(d.costs) }));
  return (
    <div dir="ltr" className="h-56 w-full" role="img" aria-label={`${incomeLabel} / ${costLabel}`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} stackOffset="sign">
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval={1} />
          <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={56}
            tickFormatter={(v: number) => money(v, currency, "en", { fx, compact: true }).replace(/(EGP|USD) /, "")} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text)" }}
            formatter={(v) => money(Math.abs(Number(v ?? 0)), currency, locale, { fx })} />
          <Bar dataKey="income" name={incomeLabel} stackId="a" fill="var(--gold-fill)" isAnimationActive={!reduced} />
          <Bar dataKey="costs" name={costLabel} stackId="a" fill="var(--teal)" isAnimationActive={!reduced} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
