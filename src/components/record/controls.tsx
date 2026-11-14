"use client";
import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import { CheckCircle2, Pencil, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { payInstallmentAction, reviewFactAction, updateAssetAction } from "@/app/record-actions";
import { Button } from "../ui";

const field = "min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm";
const label = "mb-1 block text-sm font-semibold";
const Done = ({ text }: { text: string }) => <motion.p role="status" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-1.5 text-sm text-ok"><CheckCircle2 aria-hidden="true" size={16} />{text}</motion.p>;

export interface EditValues { name: string; nameAr: string; areaSqm: number; plotAreaSqm: number | null; floor: number | null; finish: string; yearBuilt: number | null; occupancy: string; status: string; deliveryOn: string | null }

/** Change the asset's details. A reason and a source are required: the change becomes a new version and new facts. */
export function EditAsset({ id, v }: { id: string; v: EditValues }) {
  const t = useTranslations("record");
  const fi = useTranslations("finish");
  const st = useTranslations("status");
  const router = useRouter();
  const fid = useId();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(v.status);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
    start(async () => {
      setErr(null);
      const r = await updateAssetAction(id, fd);
      if (!r.ok) { setErr(t(`err_${r.error}`)); return; }
      setOpen(false); setDone(t("savedVersion", { v: r.version, n: r.changed.length, seq: r.auditSeq })); router.refresh();
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="outline" onClick={() => { setErr(null); setOpen(true); }}><Pencil aria-hidden="true" size={14} />{t("edit")}</Button>
      {done && <Done text={done} />}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
          <Dialog.Content aria-describedby={undefined} className="fixed inset-x-2 bottom-2 z-[61] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-md sm:inset-x-auto sm:start-1/2 sm:top-[5vh] sm:bottom-auto sm:max-h-[90vh] sm:w-[34rem] sm:-translate-x-1/2 sm:rtl:translate-x-1/2">
            <div className="mb-3 flex items-start justify-between gap-3"><Dialog.Title className="font-display text-xl">{t("editTitle")}</Dialog.Title><Dialog.Close className="grid size-10 place-items-center rounded-md hover:bg-surface-2" aria-label={t("close")}><X aria-hidden="true" size={16} /></Dialog.Close></div>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label htmlFor={`${fid}-n`} className={label}>{t("fName")}</label><input id={`${fid}-n`} name="name" required minLength={3} maxLength={120} defaultValue={v.name} className={field} /></div>
                <div><label htmlFor={`${fid}-na`} className={label}>{t("fNameAr")}</label><input id={`${fid}-na`} name="nameAr" dir="rtl" lang="ar" required minLength={2} maxLength={120} defaultValue={v.nameAr} className={field} /></div>
                <div><label htmlFor={`${fid}-a`} className={label}>{t("fArea")}</label><input id={`${fid}-a`} name="areaSqm" type="number" dir="ltr" required min={1} defaultValue={v.areaSqm} className={field} /></div>
                <div><label htmlFor={`${fid}-p`} className={label}>{t("fPlot")}</label><input id={`${fid}-p`} name="plotAreaSqm" type="number" dir="ltr" min={0} defaultValue={v.plotAreaSqm ?? ""} className={field} /></div>
                <div><label htmlFor={`${fid}-f`} className={label}>{t("fFloor")}</label><input id={`${fid}-f`} name="floor" type="number" dir="ltr" min={0} defaultValue={v.floor ?? ""} className={field} /></div>
                <div><label htmlFor={`${fid}-y`} className={label}>{t("fYear")}</label><input id={`${fid}-y`} name="yearBuilt" type="number" dir="ltr" min={1850} max={2035} defaultValue={v.yearBuilt ?? ""} className={field} /></div>
                <div><label htmlFor={`${fid}-fi`} className={label}>{t("fFinish")}</label><select id={`${fid}-fi`} name="finish" defaultValue={v.finish} className={field}>{["core_shell", "semi_finished", "fully_finished", "luxury"].map((x) => <option key={x} value={x}>{fi(x as "luxury")}</option>)}</select></div>
                <div><label htmlFor={`${fid}-o`} className={label}>{t("fOccupancy")}</label><select id={`${fid}-o`} name="occupancy" defaultValue={v.occupancy} className={field}>{["let", "vacant", "owner", "land"].map((x) => <option key={x} value={x}>{st(x as "let")}</option>)}</select></div>
                <div><label htmlFor={`${fid}-s`} className={label}>{t("fStatus")}</label><select id={`${fid}-s`} name="status" value={status} onChange={(e) => setStatus(e.target.value)} className={field}>{["ready", "under_construction", "off_plan"].map((x) => <option key={x} value={x}>{t(`as_${x}`)}</option>)}</select></div>
                {status !== "ready" && <div><label htmlFor={`${fid}-d`} className={label}>{t("fDelivery")}</label><input id={`${fid}-d`} name="deliveryOn" type="date" dir="ltr" defaultValue={v.deliveryOn ?? ""} className={field} /></div>}
              </div>
              <fieldset className="rounded-lg border border-line p-3">
                <legend className="px-1 text-sm font-semibold">{t("evidence")}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label htmlFor={`${fid}-sk`} className={label}>{t("fSource")}</label><select id={`${fid}-sk`} name="sourceKind" defaultValue="document" className={field}>{["document", "survey", "owner", "valuation", "import", "manual"].map((x) => <option key={x} value={x}>{t(`src_${x}`)}</option>)}</select></div>
                  <div><label htmlFor={`${fid}-sr`} className={label}>{t("fSourceRef")}</label><input id={`${fid}-sr`} name="sourceRef" maxLength={60} placeholder="D-0101" className={field} /></div>
                </div>
                <label htmlFor={`${fid}-r`} className={`${label} mt-3`}>{t("fReason")}<span aria-hidden="true" className="text-danger"> *</span></label>
                <textarea id={`${fid}-r`} name="reason" required minLength={5} maxLength={300} rows={2} className={`${field} py-2`} />
                <p className="mt-1 text-xs text-muted">{t("editNote")}</p>
              </fieldset>
              {err && <p role="alert" className="text-sm text-danger">{err}</p>}
              <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("saveVersion")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/** An analyst verifies a fact, or disputes it with a note. */
export function FactReview({ id, label: what }: { id: string; label: string }) {
  const t = useTranslations("record");
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "dispute">("idle");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = (verdict: "verified" | "disputed") => start(async () => {
    const r = await reviewFactAction(id, { verdict, note });
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
          <label className="sr-only" htmlFor={`dn-${id}`}>{t("disputeNote")}</label>
          <input id={`dn-${id}`} value={note} onChange={(e) => setNote(e.target.value)} required minLength={3} maxLength={300} placeholder={t("disputeNote")} className="min-h-10 w-56 rounded-md border border-line bg-bg px-2 text-sm" />
          <Button type="submit" size="sm" variant="outline" className="border-danger text-danger" disabled={pending}>{t("dispute")}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>{t("cancel")}</Button>
        </form>
      )}
      {err && <span role="alert" className="text-xs text-danger">{err}</span>}
    </div>
  );
}

export function PayInstallment({ id, seq }: { id: string; seq: number }) {
  const t = useTranslations("record");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await payInstallmentAction(id); if (!r.ok) setErr(t(`err_${r.error}`)); else router.refresh(); })}>{t("markPaid", { seq })}</Button>
      {err && <span role="alert" className="text-xs text-danger">{err}</span>}
    </span>
  );
}
