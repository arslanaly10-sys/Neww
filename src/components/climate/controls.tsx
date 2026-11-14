"use client";
import { useId, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, useInView, useReducedMotion } from "motion/react";
import { CheckCircle2, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { recordAssessmentAction } from "@/app/climate-actions";
import { Button } from "../ui";

const field = "min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm";
const label = "mb-1 block text-sm font-semibold";
const METHODS = ["site_survey", "engineer_report", "insurer_survey", "desk_review"] as const;

/** Record a site-specific assessment for one hazard; it replaces the screening level. */
export function AssessHazard({ assetId, hazard, what, screening, today, documents }: { assetId: string; hazard: string; what: string; screening: number; today: string; documents: { id: string; title: string }[] }) {
  const t = useTranslations("climate");
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => { setErr(null); setOpen(true); }} aria-label={t("assessFor", { what })}>{t("assess")}</Button>
      {done && <motion.p role="status" initial={{ y: 4 }} animate={{ y: 0 }} className="flex items-center gap-1.5 text-sm text-ok"><CheckCircle2 aria-hidden="true" size={16} />{done}</motion.p>}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
          <Dialog.Content aria-describedby={`${id}-d`} className="fixed inset-x-2 bottom-2 z-[61] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-md sm:inset-x-auto sm:start-1/2 sm:top-[5vh] sm:bottom-auto sm:max-h-[90vh] sm:w-[32rem] sm:-translate-x-1/2 sm:rtl:translate-x-1/2">
            <div className="mb-1 flex items-start justify-between gap-3"><Dialog.Title className="font-display text-xl">{what}</Dialog.Title><Dialog.Close className="grid size-10 place-items-center rounded-md hover:bg-surface-2" aria-label={t("close")}><X aria-hidden="true" size={16} /></Dialog.Close></div>
            <p id={`${id}-d`} className="mb-3 text-sm text-muted">{t("assessHelp", { level: t(`lv_${screening}`) })}</p>
            <form className="space-y-3" onSubmit={(e) => {
              e.preventDefault();
              const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
              start(async () => { const r = await recordAssessmentAction({ ...fd, assetId, hazard }); if (!r.ok) { setErr(t(`err_${r.error}`)); return; } setOpen(false); setDone(t("saved", { id: r.id, level: t(`lv_${r.residual}`) })); router.refresh(); });
            }}>
              <fieldset><legend className={label}>{t("level")}</legend>
                <div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5].map((n) => <label key={n} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-3 text-sm has-[:checked]:border-gold-fill has-[:checked]:bg-gold-fill/15"><input type="radio" name="level" value={n} defaultChecked={n === screening} className="accent-[var(--gold-fill)]" />{t(`lv_${n}`)}</label>)}</div>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label htmlFor={`${id}-m`} className={label}>{t("method")}</label><select id={`${id}-m`} name="method" className={field}>{METHODS.map((m) => <option key={m} value={m}>{t(`m_${m}`)}</option>)}</select></div>
                <div><label htmlFor={`${id}-o`} className={label}>{t("assessedOn")}</label><input id={`${id}-o`} name="assessedOn" type="date" dir="ltr" required max={today} defaultValue={today} className={field} /></div>
              </div>
              <div><label htmlFor={`${id}-doc`} className={label}>{t("document")}</label><select id={`${id}-doc`} name="documentId" className={field}><option value="">{t("noDocument")}</option>{documents.map((d) => <option key={d.id} value={d.id}>{d.id}: {d.title}</option>)}</select></div>
              <div><label htmlFor={`${id}-n`} className={label}>{t("findings")}</label><textarea id={`${id}-n`} name="note" required minLength={10} maxLength={600} rows={3} className={`${field} py-2`} /></div>
              {err && <p role="alert" className="text-sm text-danger">{err}</p>}
              <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("save")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/**
 * Share of portfolio value at high, medium and low exposure, one bar per hazard. The bars draw themselves when seen;
 * the percentages are always in the text, so nothing depends on the animation or on colour alone.
 */
export function ExposureBars({ rows }: { rows: { hazard: string; name: string; high: number; medium: number; low: number; text: string }[] }) {
  const t = useTranslations("climate");
  const ref = useRef<HTMLUListElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.3 });
  const still = useReducedMotion();
  const show = seen || still;
  return (
    <ul ref={ref} className="space-y-4" aria-label={t("valueAtLevel")}>
      {rows.map((r, i) => (
        <li key={r.hazard} className="grid gap-1.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center sm:gap-4">
          <span className="text-sm font-semibold">{r.name}</span>
          <div>
            <div className="flex h-4 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              {(["high", "medium", "low"] as const).map((b, j) => (
                <motion.span key={b} className={`origin-left rtl:origin-right ${b === "high" ? "bg-danger" : b === "medium" ? "bg-gold-fill" : "bg-teal/35"}`} style={{ width: `${r[b] * 100}%` }}
                  initial={still ? false : { scaleX: 0 }} animate={{ scaleX: show ? 1 : 0 }} transition={{ type: "spring", bounce: 0, visualDuration: 0.6, delay: show ? i * 0.07 + j * 0.05 : 0 }} />
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">{r.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
