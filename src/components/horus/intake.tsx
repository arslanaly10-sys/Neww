"use client";
import { useId, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Building, Building2, Home, LandPlot, Pencil, Stethoscope, Store } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { submitIntakeAction } from "@/app/evaluate-actions";
import { cn } from "@/lib/cn";
import { Button } from "../ui";

const TYPES = [["apartment", Building], ["villa", Home], ["land", LandPlot], ["clinic", Stethoscope], ["office", Building2], ["retail", Store]] as const;
const AMENITIES = ["parking", "view", "garden", "pool", "security", "elevator"] as const;
const CONDITIONS = ["core_shell", "semi_finished", "fully_finished", "luxury"] as const;
const STEPS = ["type", "location", "physical", "status", "investment", "review"] as const;
type Step = (typeof STEPS)[number];
type A = Record<string, string | string[]>;
const field = "min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm";
const label = "mb-1 block text-sm font-semibold";

/** What would make the estimate stronger, given what has been entered so far. Mirrors the engine's list. */
function missingFor(a: A) {
  const m: string[] = [];
  const t = a.type, ready = (a.status || "ready") === "ready";
  if (t !== "land" && !a.yearBuilt && ready) m.push("yearBuilt");
  if (t !== "land" && !a.condition) m.push("condition");
  if ((t === "apartment" || t === "office" || t === "clinic") && !a.floor) m.push("floor");
  if (t === "villa" && !a.plotAreaSqm) m.push("plotAreaSqm");
  if (t === "land" && !a.permittedUse) m.push("permittedUse");
  if (a.occupancy === "let" && !a.monthlyRentEgp) m.push("monthlyRentEgp");
  if (!ready && !a.deliveryOn) m.push("deliveryOn");
  return m;
}

/**
 * The HORUS questionnaire: six short steps, asking more only when it helps. No account and no documents. The last
 * step shows the answers, what is missing, and leads to an illustrative result.
 */
export function HorusIntake({ districts }: { districts: { id: string; name: string }[] }) {
  const t = useTranslations("hv");
  const locale = useLocale();
  const rtl = locale === "ar";
  const reduce = useReducedMotion();
  const router = useRouter();
  const id = useId();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [a, setA] = useState<A>({ status: "ready", occupancy: "owner", purpose: "review", amenities: [] });
  const [err, setErr] = useState<string | null>(null);
  const [bad, setBad] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const set = (k: string, v: string | string[]) => setA((x) => ({ ...x, [k]: v }));
  const v = (k: string) => (a[k] as string) ?? "";
  const s: Step = STEPS[step];
  const land = a.type === "land", villa = a.type === "villa", ready = v("status") === "ready";

  const canNext = () => {
    if (s === "type") return !!a.type;
    if (s === "location") return !!a.districtId;
    if (s === "physical") return land ? !!a.plotAreaSqm : !!a.areaSqm;
    return true;
  };
  const go = (d: number) => { setErr(null); setDir(d); setStep((x) => Math.max(0, Math.min(STEPS.length - 1, x + d))); };
  const jump = (to: Step) => { setDir(-1); setStep(STEPS.indexOf(to)); };
  const submit = () => start(async () => {
    setErr(null); setBad([]);
    const r = await submitIntakeAction({ ...a, amenities: a.amenities }, locale);
    if (!r.ok) { setErr(t(`err_${r.error}`)); setBad(r.fields ?? []); return; }
    router.push(`/evaluate/${r.id}`);
  });

  const input = (k: string, type = "number", extra: Record<string, unknown> = {}) => (
    <div><label htmlFor={`${id}-${k}`} className={label}>{t(`q_${k}`)}</label><input id={`${id}-${k}`} type={type} dir={type === "text" ? undefined : "ltr"} value={v(k)} onChange={(e) => set(k, e.target.value)} aria-invalid={bad.includes(k) || undefined} className={cn(field, bad.includes(k) && "border-danger")} {...extra} /></div>
  );
  const select = (k: string, opts: readonly string[], prefix: string, optional = true) => (
    <div><label htmlFor={`${id}-${k}`} className={label}>{t(`q_${k}`)}</label><select id={`${id}-${k}`} value={v(k)} onChange={(e) => set(k, e.target.value)} className={field}>{optional && <option value="">{t("notSure")}</option>}{opts.map((o) => <option key={o} value={o}>{t(`${prefix}${o}`)}</option>)}</select></div>
  );
  const radios = (k: string, opts: readonly string[], prefix: string) => (
    <fieldset><legend className={label}>{t(`q_${k}`)}</legend>
      <div className="flex flex-wrap gap-2">{opts.map((o) => (
        <label key={o} className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm", v(k) === o ? "border-gold-fill bg-gold-fill/15" : "border-line hover:bg-surface-2")}>
          <input type="radio" name={k} value={o} checked={v(k) === o} onChange={() => set(k, o)} className="sr-only" />{t(`${prefix}${o}`)}
        </label>
      ))}</div>
    </fieldset>
  );

  const body: Record<Step, React.ReactNode> = {
    type: (
      <fieldset>
        <legend className="sr-only">{t("s_type")}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TYPES.map(([k, Icon]) => (
            <label key={k} className={cn("relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border p-3 text-sm transition-colors", a.type === k ? "border-gold-fill" : "border-line hover:bg-surface-2")}>
              <input type="radio" name="type" value={k} checked={a.type === k} onChange={() => set("type", k)} className="sr-only" />
              {a.type === k && <motion.span layoutId={`${id}-type`} className="absolute inset-0 -z-10 rounded-xl bg-gold-fill/15" transition={{ type: "spring", bounce: 0, visualDuration: 0.3 }} />}
              <Icon aria-hidden="true" size={26} className={a.type === k ? "text-gold" : "text-muted"} />{t(`t_${k}`)}
            </label>
          ))}
        </div>
      </fieldset>
    ),
    location: (
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor={`${id}-d`} className={label}>{t("q_districtId")}</label>
          <select id={`${id}-d`} value={v("districtId")} onChange={(e) => set("districtId", e.target.value)} className={field}><option value="">{t("choose")}</option>{districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}<option value="other">{t("otherRegion")}</option></select></div>
        {input("compound", "text", { maxLength: 120 })}
        {v("districtId") === "other" && <p className="text-xs text-muted sm:col-span-2">{t("otherRegionNote")}</p>}
      </div>
    ),
    physical: (
      <div className="grid gap-4 sm:grid-cols-2">
        {!land && input("areaSqm", "number", { min: 10, inputMode: "numeric" })}
        {(land || villa) && input("plotAreaSqm", "number", { min: 10, inputMode: "numeric" })}
        {!land && (a.type === "apartment" || a.type === "office" || a.type === "clinic") && input("floor", "number", { min: 0 })}
        {!land && (a.type === "apartment" || villa) && input("beds", "number", { min: 0 })}
        {!land && (a.type === "apartment" || villa) && input("baths", "number", { min: 0 })}
        {!land && input("yearBuilt", "number", { min: 1900, max: 2035 })}
        {!land && select("condition", CONDITIONS, "c_")}
        {land && select("permittedUse", ["residential", "commercial", "industrial", "agricultural", "unknown"], "u_")}
        {land && input("frontageM", "number", { min: 1 })}
        {land && select("utilities", ["yes", "no", "unknown"], "y_")}
        {villa && <p className="text-xs text-muted sm:col-span-2">{t("villaNote")}</p>}
      </div>
    ),
    status: (
      <div className="space-y-5">
        {!land && radios("status", ["ready", "under_construction", "off_plan"], "st2_")}
        {!ready && !land && <div className="grid gap-4 sm:grid-cols-3">{input("deliveryOn", "date")}{input("installmentBalanceEgp", "number", { min: 0 })}{input("installmentMonthsLeft", "number", { min: 0, max: 240 })}</div>}
        {!land && radios("occupancy", ["owner", "let", "vacant"], "o_")}
        {!land && (
          <fieldset><legend className={label}>{t("q_amenities")}</legend>
            <div className="flex flex-wrap gap-2">{AMENITIES.map((m) => {
              const on = (a.amenities as string[]).includes(m);
              return <label key={m} className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm", on ? "border-gold-fill bg-gold-fill/15" : "border-line hover:bg-surface-2")}><input type="checkbox" checked={on} onChange={() => set("amenities", on ? (a.amenities as string[]).filter((x) => x !== m) : [...(a.amenities as string[]), m])} className="sr-only" />{t(`am_${m}`)}</label>;
            })}</div>
          </fieldset>
        )}
        {land && <p className="text-sm text-muted">{t("landStatusNote")}</p>}
      </div>
    ),
    investment: (
      <div className="space-y-5">
        {radios("purpose", ["sale", "hold", "review"], "p_")}
        <p className="text-sm text-muted">{t("optionalNote")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {input("purchasePriceEgp", "number", { min: 1000 })}
          {input("purchaseDate", "date")}
          {v("occupancy") === "let" && input("monthlyRentEgp", "number", { min: 100 })}
        </div>
      </div>
    ),
    review: (() => {
      const miss = missingFor(a);
      const rows: [Step, string, string][] = [
        ["type", t("s_type"), a.type ? t(`t_${a.type}`) : "–"],
        ["location", t("s_location"), `${v("districtId") === "other" ? t("otherRegion") : districts.find((d) => d.id === a.districtId)?.name ?? "–"}${v("compound") ? `, ${v("compound")}` : ""}`],
        ["physical", t("s_physical"), [a.areaSqm && `${a.areaSqm} m²`, a.plotAreaSqm && t("plotShort", { n: v("plotAreaSqm") }), a.floor && t("floorShort", { n: v("floor") }), a.yearBuilt, a.condition && t(`c_${a.condition}`)].filter(Boolean).join(", ") || "–"],
        ["status", t("s_status"), land ? "–" : [t(`st2_${v("status")}`), t(`o_${v("occupancy")}`), ...(a.amenities as string[]).map((m) => t(`am_${m}`))].join(", ")],
        ["investment", t("s_investment"), [t(`p_${v("purpose")}`), a.purchasePriceEgp && t("paidShort", { n: Number(a.purchasePriceEgp).toLocaleString(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US") }), a.monthlyRentEgp && t("rentShort", { n: Number(a.monthlyRentEgp).toLocaleString(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US") })].filter(Boolean).join(", ")],
      ];
      return (
        <div className="space-y-5">
          <ul aria-label={t("s_review")} className="divide-y divide-line rounded-lg border border-line">
            {rows.map(([k, l, val]) => (
              <li key={k} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div><p className="text-muted">{l}</p><p className="font-medium">{val}</p></div>
                <button type="button" onClick={() => jump(k)} className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-gold hover:bg-surface-2"><Pencil aria-hidden="true" size={14} />{t("edit")}<span className="sr-only"> {l}</span></button>
              </li>
            ))}
          </ul>
          {miss.length > 0 ? (
            <div className="rounded-lg border border-gold-fill/50 p-4 text-sm"><p className="font-semibold">{t("missingTitle")}</p><ul className="mt-1 list-disc ps-5 text-muted">{miss.map((m) => <li key={m}>{t(`q_${m}`)}</li>)}</ul><p className="mt-2 text-xs text-muted">{t("missingNote")}</p></div>
          ) : <p className="text-sm text-ok">{t("nothingMissing")}</p>}
          <p className="text-xs text-muted">{t("noDocsNote")}</p>
        </div>
      );
    })(),
  };

  const x = (d: number) => (reduce ? 0 : (rtl ? -d : d) * 40);
  return (
    <div className="space-y-6">
      <ol className="flex gap-1.5" aria-label={t("progress", { n: step + 1, total: STEPS.length })}>
        {STEPS.map((k, i) => (
          <li key={k} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-current={i === step ? "step" : undefined}>
            <motion.span className="absolute inset-0 rounded-full bg-gold-fill" style={{ originX: rtl ? 1 : 0 }} initial={false} animate={{ scaleX: i <= step ? 1 : 0 }} transition={{ type: "spring", bounce: 0, visualDuration: 0.4 }} />
            <span className="sr-only">{t(`s_${k}`)}</span>
          </li>
        ))}
      </ol>
      <div>
        <p className="text-sm text-gold">{t("stepOf", { n: step + 1, total: STEPS.length })}</p>
        <h2 className="mt-1 font-display text-3xl">{t(`s_${s}`)}</h2>
        <p className="mt-1 text-sm text-muted">{t(`sh_${s}`)}</p>
      </div>
      <div className="relative min-h-[16rem]">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div key={s} initial={{ opacity: 0, x: x(dir) }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: x(-dir) }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
            {body[s]}
          </motion.div>
        </AnimatePresence>
      </div>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" disabled={step === 0} onClick={() => go(-1)}><ArrowLeft aria-hidden="true" size={16} className="rtl:rotate-180" />{t("back")}</Button>
        {s !== "review"
          ? <Button type="button" variant="gold" disabled={!canNext()} onClick={() => go(1)}>{t("next")}<ArrowRight aria-hidden="true" size={16} className="rtl:rotate-180" /></Button>
          : <Button type="button" variant="gold" disabled={pending} onClick={submit}>{pending ? t("working") : t("seeResult")}<ArrowRight aria-hidden="true" size={16} className="rtl:rotate-180" /></Button>}
      </div>
    </div>
  );
}
