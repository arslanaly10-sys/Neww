"use client";
import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import { CheckCircle2, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { recordPermitAction, reviewPermitAction } from "@/app/permit-actions";
import { PERMIT_STATUSES, TITLE_FORMS, type PermitKind } from "@/lib/permits-rules";
import { Button } from "../ui";

const field = "min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm";
const label = "mb-1 block text-sm font-semibold";

export interface PermitDraft { kind: PermitKind; status: string; form: string | null; authority: string; reference: string; appliedOn: string | null; issuedOn: string | null; expiresOn: string | null; documentId: string | null }

/** Record or renew one permit. The form starts from what is on file; saving keeps the old entry as history. */
export function RecordPermit({ assetId, kind, current, documents, today, what, renew }: { assetId: string; kind: PermitKind; current: PermitDraft | null; documents: { id: string; title: string }[]; today: string; what: string; renew: boolean }) {
  const t = useTranslations("permits");
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(current?.status ?? "valid");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const title = kind === "title_registration";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => { setErr(null); setStatus(current?.status ?? "valid"); setOpen(true); }} aria-label={t(renew ? "updateFor" : "recordFor", { what })}>{t(renew ? "update" : "record")}</Button>
      {done && <motion.p role="status" initial={{ y: 4 }} animate={{ y: 0 }} className="flex items-center gap-1.5 text-sm text-ok"><CheckCircle2 aria-hidden="true" size={16} />{done}</motion.p>}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
          <Dialog.Content aria-describedby={`${id}-d`} className="fixed inset-x-2 bottom-2 z-[61] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-md sm:inset-x-auto sm:start-1/2 sm:top-[5vh] sm:bottom-auto sm:max-h-[90vh] sm:w-[34rem] sm:-translate-x-1/2 sm:rtl:translate-x-1/2">
            <div className="mb-1 flex items-start justify-between gap-3"><Dialog.Title className="font-display text-xl">{what}</Dialog.Title><Dialog.Close className="grid size-10 place-items-center rounded-md hover:bg-surface-2" aria-label={t("close")}><X aria-hidden="true" size={16} /></Dialog.Close></div>
            <p id={`${id}-d`} className="mb-3 text-sm text-muted">{t("recordHelp")}</p>
            <form className="space-y-3" onSubmit={(e) => {
              e.preventDefault();
              const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
              start(async () => { const r = await recordPermitAction({ ...fd, assetId, kind }); if (!r.ok) { setErr(t(`err_${r.error}`)); return; } setOpen(false); setDone(t("saved", { id: r.id })); router.refresh(); });
            }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label htmlFor={`${id}-s`} className={label}>{t("status")}</label><select id={`${id}-s`} name="status" value={status} onChange={(e) => setStatus(e.target.value)} className={field}>{PERMIT_STATUSES.map((s) => <option key={s} value={s}>{t(`st_${s}`)}</option>)}</select></div>
                {title && <div><label htmlFor={`${id}-f`} className={label}>{t("form")}</label><select id={`${id}-f`} name="form" defaultValue={current?.form ?? "registered"} className={field}>{TITLE_FORMS.map((f) => <option key={f} value={f}>{t(`tf_${f}`)}</option>)}</select></div>}
                <div><label htmlFor={`${id}-a`} className={label}>{t("authority")}</label><input id={`${id}-a`} name="authority" defaultValue={current?.authority ?? ""} maxLength={160} className={field} /></div>
                <div><label htmlFor={`${id}-r`} className={label}>{t("reference")}</label><input id={`${id}-r`} name="reference" dir="ltr" defaultValue={current?.reference ?? ""} maxLength={80} className={field} /></div>
                {status === "pending" || status === "refused" ? (
                  <div><label htmlFor={`${id}-ap`} className={label}>{t("appliedOn")}</label><input id={`${id}-ap`} name="appliedOn" type="date" dir="ltr" required={status === "pending"} max={today} defaultValue={current?.appliedOn ?? today} className={field} /></div>
                ) : status !== "missing" && (
                  <>
                    <div><label htmlFor={`${id}-i`} className={label}>{t("issuedOn")}</label><input id={`${id}-i`} name="issuedOn" type="date" dir="ltr" required={status === "valid"} max={today} defaultValue={renew ? "" : current?.issuedOn ?? ""} className={field} /></div>
                    <div><label htmlFor={`${id}-e`} className={label}>{t("expiresOnOptional")}</label><input id={`${id}-e`} name="expiresOn" type="date" dir="ltr" defaultValue={renew ? "" : current?.expiresOn ?? ""} className={field} /></div>
                  </>
                )}
              </div>
              <div><label htmlFor={`${id}-doc`} className={label}>{t("document")}</label><select id={`${id}-doc`} name="documentId" defaultValue={current?.documentId ?? ""} className={field}><option value="">{t("noDocument")}</option>{documents.map((d) => <option key={d.id} value={d.id}>{d.id}: {d.title}</option>)}</select></div>
              <div><label htmlFor={`${id}-n`} className={label}>{t("note")}</label><textarea id={`${id}-n`} name="note" rows={2} maxLength={500} className={`${field} py-2`} /></div>
              {err && <p role="alert" className="text-sm text-danger">{err}</p>}
              <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("save")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/** An analyst checks a permit against its document. */
export function PermitReview({ id, what }: { id: string; what: string }) {
  const t = useTranslations("permits");
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "dispute">("idle");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = (verdict: "verified" | "disputed") => start(async () => {
    const r = await reviewPermitAction(id, { verdict, note });
    if (!r.ok) { setErr(t(`err_${r.error}`)); return; }
    setErr(null); setMode("idle"); router.refresh();
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mode === "idle" ? (
        <>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => send("verified")} aria-label={t("verifyThis", { what })}><ShieldCheck aria-hidden="true" size={14} />{t("verify")}</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setMode("dispute")} aria-label={t("disputeThis", { what })}><ShieldAlert aria-hidden="true" size={14} />{t("dispute")}</Button>
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); send("disputed"); }} className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`pd-${id}`}>{t("disputeNote")}</label>
          <input id={`pd-${id}`} value={note} onChange={(e) => setNote(e.target.value)} required minLength={5} maxLength={300} placeholder={t("disputeNote")} className="min-h-10 w-56 rounded-md border border-line bg-bg px-2 text-sm" />
          <Button type="submit" size="sm" variant="outline" className="border-danger text-danger" disabled={pending}>{t("dispute")}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>{t("cancel")}</Button>
        </form>
      )}
      {err && <span role="alert" className="text-xs text-danger">{err}</span>}
    </div>
  );
}
