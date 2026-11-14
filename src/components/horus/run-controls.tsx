"use client";
import { useId, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "motion/react";
import { CheckCircle2, Sparkles, Undo2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { reviewRunAction, startRunAction } from "@/app/run-actions";
import { saveContactAction } from "@/app/evaluate-actions";
import { Button } from "../ui";

const field = "min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm";

/** Run HORUS on this asset; the report opens when it is ready. */
export function StartRun({ assetId }: { assetId: string }) {
  const t = useTranslations("hv");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" variant="gold" disabled={pending} onClick={() => start(async () => { const r = await startRunAction(assetId); if (!r.ok) { setErr(t(`err_${r.error}`)); return; } router.push(`/valuation/runs/${r.id}`); })}>
        <Sparkles aria-hidden="true" size={14} />{pending ? t("working") : t("runHorus")}
      </Button>
      {err && <span role="alert" className="text-xs text-danger">{err}</span>}
    </span>
  );
}

/** The analyst's decision: sign off, or send back with a note. */
export function ReviewRun({ id }: { id: string }) {
  const t = useTranslations("hv");
  const router = useRouter();
  const fid = useId();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = (verdict: "signed_off" | "returned") => start(async () => {
    const r = await reviewRunAction(id, { verdict, note });
    if (!r.ok) { setErr(t(`err_${r.error}`)); return; }
    setErr(null); router.refresh();
  });
  return (
    <div className="space-y-3 rounded-xl border border-gold-fill/60 p-4">
      <h2 className="font-display text-xl">{t("reviewTitle")}</h2>
      <p className="text-sm text-muted">{t("reviewLead")}</p>
      <label htmlFor={`${fid}-n`} className="block text-sm font-semibold">{t("reviewNote")}</label>
      <textarea id={`${fid}-n`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className={`${field} py-2`} />
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="gold" disabled={pending} onClick={() => send("signed_off")}><CheckCircle2 aria-hidden="true" size={16} />{t("signOff")}</Button>
        <Button variant="outline" disabled={pending} onClick={() => send("returned")}><Undo2 aria-hidden="true" size={16} />{t("sendBack")}</Button>
      </div>
    </div>
  );
}

/** Keep the result: name, email and consent; it becomes a request for a portfolio workspace. */
export function KeepResult({ id }: { id: string }) {
  const t = useTranslations("hv");
  const locale = useLocale();
  const fid = useId();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) return <motion.p role="status" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-sm text-ok"><CheckCircle2 aria-hidden="true" size={16} />{t("keepDone")}</motion.p>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { const r = await saveContactAction(id, { name: fd.get("name"), email: fd.get("email"), consent: fd.get("consent") === "on" }, locale); if (!r.ok) { setErr(t(`err_${r.error}`)); return; } setDone(true); }); }} className="grid gap-3 sm:grid-cols-2">
      <div><label htmlFor={`${fid}-n`} className="mb-1 block text-sm font-semibold">{t("keepName")}</label><input id={`${fid}-n`} name="name" required minLength={2} maxLength={80} autoComplete="name" className={field} /></div>
      <div><label htmlFor={`${fid}-e`} className="mb-1 block text-sm font-semibold">{t("keepEmail")}</label><input id={`${fid}-e`} name="email" type="email" required maxLength={120} autoComplete="email" dir="ltr" className={field} /></div>
      <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="consent" required className="mt-0.5 size-5 shrink-0 accent-[var(--gold-fill)]" />{t("keepConsent")}</label>
      {err && <p role="alert" className="text-sm text-danger sm:col-span-2">{err}</p>}
      <div className="sm:col-span-2"><Button type="submit" variant="gold" disabled={pending}>{t("keepCta")}</Button></div>
    </form>
  );
}
