"use client";
import { useId, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { Banknote, CheckCircle2, Mail, PencilLine, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { recordPaymentAction, sendReminderAction, updateRenewalAction } from "@/app/leasing-actions";
import { RENEWAL_STAGES } from "@/lib/leasing-calc";
import { Button } from "../ui";

const field = "min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm";
const label = "mb-1 block text-sm font-semibold";

function Sheet({ title, open, onOpenChange, children }: { title: string; open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) {
  const t = useTranslations("lease");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-x-2 bottom-2 z-[61] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-md sm:inset-x-auto sm:start-1/2 sm:top-[12vh] sm:bottom-auto sm:w-[28rem] sm:-translate-x-1/2 sm:rtl:translate-x-1/2">
          <div className="mb-3 flex items-start justify-between gap-3">
            <Dialog.Title className="font-display text-xl">{title}</Dialog.Title>
            <Dialog.Close className="grid size-10 shrink-0 place-items-center rounded-md hover:bg-surface-2" aria-label={t("close")}><X aria-hidden="true" size={16} /></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const Done = ({ text }: { text: string }) => <p role="status" className="flex items-start gap-1.5 text-xs text-ok"><CheckCircle2 aria-hidden="true" size={14} className="mt-0.5 shrink-0" />{text}</p>;

/** Record money received against one invoice. The amount defaults to what is still owed. */
export function RecordPayment({ invoiceId, outstandingEgp, period, today, title }: { invoiceId: string; outstandingEgp: number; period: string; today: string; title: string }) {
  const t = useTranslations("lease");
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) return <Done text={done} />;
  const submit = (fd: FormData) => start(async () => {
    setErr(null);
    const r = await recordPaymentAction({ invoiceId, amountEgp: fd.get("amount"), paidOn: fd.get("paidOn"), method: fd.get("method") });
    if (!r.ok) { setErr(t(`err_${r.error}` as "err_invalid")); return; }
    setDone(r.status === "paid" ? t("paidInFull", { seq: r.auditSeq }) : t("paidPart", { left: r.outstandingEgp.toLocaleString(), seq: r.auditSeq }));
    setOpen(false); router.refresh();
  });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Banknote aria-hidden="true" size={14} />{t("record")}</Button>
      <Sheet title={t("recordTitle", { what: title })} open={open} onOpenChange={setOpen}>
        <form onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }} className="space-y-3">
          <div><label htmlFor={`${id}-a`} className={label}>{t("amountEgp")}</label><input id={`${id}-a`} name="amount" type="number" inputMode="numeric" dir="ltr" min={1} max={outstandingEgp} defaultValue={outstandingEgp} required className={field} /></div>
          <div><label htmlFor={`${id}-d`} className={label}>{t("paidOn")}</label><input id={`${id}-d`} name="paidOn" type="date" dir="ltr" min={period} max={today} defaultValue={today} required className={field} /></div>
          <div><label htmlFor={`${id}-m`} className={label}>{t("method")}</label>
            <select id={`${id}-m`} name="method" className={field} defaultValue="transfer">{(["transfer", "cheque", "cash"] as const).map((m) => <option key={m} value={m}>{t(`m_${m}`)}</option>)}</select></div>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("recordConfirm")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
          <p className="text-xs text-muted">{t("audited")}</p>
        </form>
      </Sheet>
    </>
  );
}

/** Email the tenant's contact about an overdue invoice (to the outbox in this demo). */
export function SendReminder({ invoiceId, lastReminderOn }: { invoiceId: string; lastReminderOn: string | null }) {
  const t = useTranslations("lease");
  const locale = useLocale();
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg?.ok) return <Done text={msg.text} />;
  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => {
        const r = await sendReminderAction(invoiceId, locale);
        setMsg(r.ok ? { ok: true, text: t("reminded", { id: r.outboxId, seq: r.auditSeq }) } : { ok: false, text: t(`err_${r.error}` as "err_invalid") });
        if (r.ok) router.refresh();
      })}><Mail aria-hidden="true" size={14} />{t("remind")}</Button>
      {lastReminderOn && <span className="text-xs text-muted">{t("lastReminder", { date: lastReminderOn })}</span>}
      {msg && !msg.ok && <span role="alert" className="text-xs text-danger">{msg.text}</span>}
    </div>
  );
}

/** Move a lease's renewal along: stage, proposed rent and end date, and a note. */
export function RenewalEditor({ leaseId, title, current, currency, endDate }: { leaseId: string; title: string; currency: string; endDate: string; current: { status: string; proposedRent: number | null; proposedEnd: string | null; note: string } | null }) {
  const t = useTranslations("lease");
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (fd: FormData) => start(async () => {
    setErr(null);
    const r = await updateRenewalAction({ leaseId, status: fd.get("status"), proposedRent: fd.get("proposedRent"), proposedEnd: fd.get("proposedEnd"), note: fd.get("note") });
    if (!r.ok) { setErr(r.error === "invalid" ? t("renewalInvalid") : t(`err_${r.error}` as "err_invalid")); return; }
    setDone(t("renewalSaved", { seq: r.auditSeq })); setOpen(false); router.refresh();
  });
  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="outline" onClick={() => { setDone(null); setOpen(true); }}><PencilLine aria-hidden="true" size={14} />{t("updateRenewal")}</Button>
      {done && <Done text={done} />}
      <Sheet title={t("renewalTitle", { what: title })} open={open} onOpenChange={setOpen}>
        <form onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }} className="space-y-3">
          <div><label htmlFor={`${id}-s`} className={label}>{t("stage")}</label>
            <select id={`${id}-s`} name="status" defaultValue={current?.status ?? "not_started"} className={field}>{RENEWAL_STAGES.map((s) => <option key={s} value={s}>{t(`st_${s}`)}</option>)}</select></div>
          <div><label htmlFor={`${id}-r`} className={label}>{t("proposedRent", { currency })}</label><input id={`${id}-r`} name="proposedRent" type="number" inputMode="numeric" dir="ltr" min={1} defaultValue={current?.proposedRent ?? ""} className={field} /></div>
          <div><label htmlFor={`${id}-e`} className={label}>{t("proposedEnd")}</label><input id={`${id}-e`} name="proposedEnd" type="date" dir="ltr" min={endDate} defaultValue={current?.proposedEnd ?? ""} className={field} /></div>
          <div><label htmlFor={`${id}-n`} className={label}>{t("note")}</label><textarea id={`${id}-n`} name="note" rows={2} maxLength={500} defaultValue={current?.note ?? ""} className={`${field} py-2`} /></div>
          <p className="text-xs text-muted">{t("renewalRule")}</p>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("save")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
        </form>
      </Sheet>
    </div>
  );
}
