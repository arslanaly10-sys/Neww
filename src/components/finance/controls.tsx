"use client";
import { useId, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, HandCoins, Plus, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { addLedgerEntryAction, markDistributionPaidAction, proposeDistributionAction } from "@/app/finance-actions";
import { CATEGORIES } from "@/lib/finance-calc";
import { Button } from "../ui";

const field = "min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm";
const label = "mb-1 block text-sm font-semibold";
const Done = ({ text }: { text: string }) => <p role="status" className="flex items-start gap-1.5 text-sm text-ok"><CheckCircle2 aria-hidden="true" size={16} className="mt-0.5 shrink-0" />{text}</p>;

function Sheet({ title, open, onOpenChange, children }: { title: string; open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) {
  const t = useTranslations("fin");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-x-2 bottom-2 z-[61] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-md sm:inset-x-auto sm:start-1/2 sm:top-[10vh] sm:bottom-auto sm:w-[30rem] sm:-translate-x-1/2 sm:rtl:translate-x-1/2">
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

/** Add an income or cost line by hand. The amount is always entered positive; the category decides the sign. */
export function AddEntry({ assets, today }: { assets: { id: string; name: string; nameAr: string }[]; today: string }) {
  const t = useTranslations("fin");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (fd: FormData) => start(async () => {
    setErr(null);
    const r = await addLedgerEntryAction(Object.fromEntries(fd.entries()));
    if (!r.ok) { setErr(t(`err_${r.error}` as "err_invalid")); return; }
    setDone(t("entryAdded", { id: r.id, seq: r.auditSeq })); setOpen(false); router.refresh();
  });
  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="gold" size="sm" onClick={() => { setDone(null); setOpen(true); }}><Plus aria-hidden="true" size={14} />{t("addEntry")}</Button>
      {done && <Done text={done} />}
      <Sheet title={t("addEntry")} open={open} onOpenChange={setOpen}>
        <form onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }} className="space-y-3">
          <div><label htmlFor={`${id}-c`} className={label}>{t("category")}</label>
            <select id={`${id}-c`} name="category" className={field} defaultValue="maintenance">{CATEGORIES.map((c) => <option key={c} value={c}>{t(`c_${c}`)}</option>)}</select></div>
          <div><label htmlFor={`${id}-a`} className={label}>{t("amountEgp")}</label><input id={`${id}-a`} name="amountEgp" type="number" inputMode="numeric" dir="ltr" min={1} required className={field} /><p className="mt-1 text-xs text-muted">{t("amountHelp")}</p></div>
          <div><label htmlFor={`${id}-d`} className={label}>{t("date")}</label><input id={`${id}-d`} name="entryDate" type="date" dir="ltr" max={today} defaultValue={today} required className={field} /></div>
          <div><label htmlFor={`${id}-s`} className={label}>{t("asset")}</label>
            <select id={`${id}-s`} name="assetId" className={field} defaultValue=""><option value="">{t("portfolioLevel")}</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.id}: {locale === "ar" ? a.nameAr : a.name}</option>)}</select></div>
          <div><label htmlFor={`${id}-m`} className={label}>{t("memo")}</label><input id={`${id}-m`} name="memo" required minLength={3} maxLength={200} className={field} /></div>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("save")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
          <p className="text-xs text-muted">{t("auditedEntry")}</p>
        </form>
      </Sheet>
    </div>
  );
}

/** Propose the distribution for the last closed quarter; a different manager approves it on Alerts and approvals. */
export function ProposeDistribution({ period, suggested, noi, fmtNoi }: { period: string; suggested: number; noi: number; fmtNoi: string }) {
  const t = useTranslations("fin");
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) return <Done text={done} />;
  const submit = (fd: FormData) => start(async () => {
    setErr(null);
    const r = await proposeDistributionAction({ amountEgp: fd.get("amountEgp"), note: fd.get("note") });
    if (!r.ok) { setErr(t(`err_${r.error}` as "err_invalid")); return; }
    setDone(t("proposed", { id: r.id, approval: r.approvalId, seq: r.auditSeq })); setOpen(false); router.refresh();
  });
  return (
    <>
      <Button variant="gold" onClick={() => setOpen(true)}><HandCoins aria-hidden="true" size={16} />{t("propose", { period })}</Button>
      <Sheet title={t("proposeTitle", { period })} open={open} onOpenChange={setOpen}>
        <form onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }} className="space-y-3">
          <p className="text-sm text-muted">{t("proposeHelp", { noi: fmtNoi })}</p>
          <div><label htmlFor={`${id}-a`} className={label}>{t("amountEgp")}</label><input id={`${id}-a`} name="amountEgp" type="number" inputMode="numeric" dir="ltr" min={1} max={noi} defaultValue={suggested} required className={field} /></div>
          <div><label htmlFor={`${id}-n`} className={label}>{t("noteOptional")}</label><input id={`${id}-n`} name="note" maxLength={300} className={field} /></div>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("proposeConfirm")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
          <p className="text-xs text-muted">{t("proposeRule")}</p>
        </form>
      </Sheet>
    </>
  );
}

export function MarkPaid({ id }: { id: string }) {
  const t = useTranslations("fin");
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg?.ok) return <Done text={msg.text} />;
  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
        const r = await markDistributionPaidAction(id);
        setMsg(r.ok ? { ok: true, text: t("paidMsg", { seq: r.auditSeq }) } : { ok: false, text: t(`err_${r.error}` as "err_invalid") });
        if (r.ok) router.refresh();
      })}>{t("markPaid")}</Button>
      {msg && !msg.ok && <span role="alert" className="text-xs text-danger">{msg.text}</span>}
    </div>
  );
}
