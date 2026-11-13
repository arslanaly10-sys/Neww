"use client";
import { useId, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import { CheckCircle2, Pencil, Plus, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { addDealNoteAction, createDealAction, moveDealAction, updateDealAction } from "@/app/deals-actions";
import { cn } from "@/lib/cn";
import { Button } from "../ui";
import type { Stage } from "./board";

const TYPES = ["apartment", "villa", "office", "retail", "land", "mixed"] as const;
const SOURCES = ["broker", "developer", "direct", "auction"] as const;
const field = "min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm";
const label = "mb-1 block text-sm font-semibold";
type Opt = { id: string; name: string; nameAr: string };
export interface DealValues { kind: "buy" | "sell"; title: string; titleAr: string | null; districtId: string; type: string; areaSqm: number | null; assetId: string | null; askingEgp: number; offerEgp: number | null; ownerId: string; counterparty: string; source: string; expectedClose: string | null; notes: string; shared: boolean }

function Sheet({ title, open, onOpenChange, children }: { title: string; open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) {
  const t = useTranslations("deals");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-x-2 bottom-2 z-[61] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-md sm:inset-x-auto sm:start-1/2 sm:top-[5vh] sm:bottom-auto sm:max-h-[90vh] sm:w-[34rem] sm:-translate-x-1/2 sm:rtl:translate-x-1/2">
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

function Fields({ v, managers, districts, assets }: { v: DealValues; managers: Opt[]; districts: Opt[]; assets: Opt[] }) {
  const t = useTranslations("deals");
  const ty = useTranslations("types");
  const ar = useLocale() === "ar";
  const id = useId();
  const [kind, setKind] = useState(v.kind);
  const nm = (o: Opt) => (ar ? o.nameAr : o.name);
  return (
    <>
      <fieldset><legend className={label}>{t("kind")}</legend>
        <div className="flex gap-4 text-sm">{(["buy", "sell"] as const).map((k) => <label key={k} className="flex min-h-11 items-center gap-2"><input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />{t(`k_${k}`)}</label>)}</div>
      </fieldset>
      <div><label htmlFor={`${id}-t`} className={label}>{t("fTitle")}<span aria-hidden="true" className="text-danger"> *</span></label><input id={`${id}-t`} name="title" required minLength={4} maxLength={120} defaultValue={v.title} className={field} /></div>
      <div><label htmlFor={`${id}-ta`} className={label}>{t("fTitleAr")}</label><input id={`${id}-ta`} name="titleAr" dir="rtl" lang="ar" maxLength={120} defaultValue={v.titleAr ?? ""} className={field} /></div>
      {kind === "sell" && (
        <div><label htmlFor={`${id}-as`} className={label}>{t("fAsset")}<span aria-hidden="true" className="text-danger"> *</span></label>
          <select id={`${id}-as`} name="assetId" required defaultValue={v.assetId ?? ""} className={field}><option value="">{t("chooseAsset")}</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.id}: {nm(a)}</option>)}</select></div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor={`${id}-d`} className={label}>{t("fDistrict")}</label><select id={`${id}-d`} name="districtId" defaultValue={v.districtId} className={field}>{districts.map((d) => <option key={d.id} value={d.id}>{nm(d)}</option>)}</select></div>
        <div><label htmlFor={`${id}-ty`} className={label}>{t("fType")}</label><select id={`${id}-ty`} name="type" defaultValue={v.type} className={field}>{TYPES.map((x) => <option key={x} value={x}>{ty(x)}</option>)}</select></div>
        <div><label htmlFor={`${id}-ar`} className={label}>{t("fArea")}</label><input id={`${id}-ar`} name="areaSqm" type="number" inputMode="numeric" dir="ltr" min={1} defaultValue={v.areaSqm ?? ""} className={field} /></div>
        <div><label htmlFor={`${id}-s`} className={label}>{t("fSource")}</label><select id={`${id}-s`} name="source" defaultValue={v.source} className={field}>{SOURCES.map((x) => <option key={x} value={x}>{t(`src_${x}`)}</option>)}</select></div>
        <div><label htmlFor={`${id}-a`} className={label}>{t("fAsking")}<span aria-hidden="true" className="text-danger"> *</span></label><input id={`${id}-a`} name="askingEgp" type="number" inputMode="numeric" dir="ltr" required min={1} defaultValue={v.askingEgp || ""} className={field} /></div>
        <div><label htmlFor={`${id}-o`} className={label}>{t("fOffer")}</label><input id={`${id}-o`} name="offerEgp" type="number" inputMode="numeric" dir="ltr" min={1} defaultValue={v.offerEgp ?? ""} className={field} /></div>
        <div><label htmlFor={`${id}-w`} className={label}>{t("fOwner")}</label><select id={`${id}-w`} name="ownerId" defaultValue={v.ownerId} className={field}>{managers.map((m) => <option key={m.id} value={m.id}>{nm(m)}</option>)}</select></div>
        <div><label htmlFor={`${id}-c`} className={label}>{t("fClose")}</label><input id={`${id}-c`} name="expectedClose" type="date" dir="ltr" defaultValue={v.expectedClose ?? ""} className={field} /></div>
      </div>
      <div><label htmlFor={`${id}-cp`} className={label}>{t("fCounterparty")}</label><input id={`${id}-cp`} name="counterparty" maxLength={120} defaultValue={v.counterparty} className={field} /></div>
      <div><label htmlFor={`${id}-n`} className={label}>{t("fNotes")}</label><textarea id={`${id}-n`} name="notes" rows={3} maxLength={2000} defaultValue={v.notes} className={`${field} py-2`} /></div>
      <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" name="shared" defaultChecked={v.shared} className="mt-0.5 size-5 shrink-0 accent-[var(--gold-fill)]" /><span><span className="block">{t("fShared")}</span><span className="text-xs text-muted">{t("fSharedHelp")}</span></span></label>
    </>
  );
}

export function NewDeal({ managers, districts, assets, me }: { managers: Opt[]; districts: Opt[]; assets: Opt[]; me: string }) {
  const t = useTranslations("deals");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
    start(async () => {
      setErr(null);
      const r = await createDealAction(fd);
      if (!r.ok) { setErr(t(`err_${r.error}`)); return; }
      setOpen(false); router.push(`/deals/${r.id}?created=1`);
    });
  };
  return (
    <>
      <Button variant="gold" size="sm" onClick={() => { setErr(null); setOpen(true); }}><Plus aria-hidden="true" size={14} />{t("new")}</Button>
      <Sheet title={t("new")} open={open} onOpenChange={setOpen}>
        <form onSubmit={submit} className="space-y-3">
          <Fields v={{ kind: "buy", title: "", titleAr: null, districtId: districts[0]?.id ?? "", type: "apartment", areaSqm: null, assetId: null, askingEgp: 0, offerEgp: null, ownerId: me, counterparty: "", source: "broker", expectedClose: null, notes: "", shared: false }} managers={managers} districts={districts} assets={assets} />
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("create")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
        </form>
      </Sheet>
    </>
  );
}

export function EditDeal({ id, v, managers, districts, assets }: { id: string; v: DealValues; managers: Opt[]; districts: Opt[]; assets: Opt[] }) {
  const t = useTranslations("deals");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
    start(async () => {
      setErr(null);
      const r = await updateDealAction(id, fd);
      if (!r.ok) { setErr(t(`err_${r.error}`)); return; }
      setOpen(false); setDone(r.changed.length ? t("saved", { n: r.changed.length }) : t("noChanges")); router.refresh();
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="outline" onClick={() => { setErr(null); setOpen(true); }}><Pencil aria-hidden="true" size={14} />{t("edit")}</Button>
      {done && <p role="status" className="flex items-center gap-1.5 text-sm text-ok"><CheckCircle2 aria-hidden="true" size={16} />{done}</p>}
      <Sheet title={t("editTitle")} open={open} onOpenChange={setOpen}>
        <form onSubmit={submit} className="space-y-3">
          <Fields v={v} managers={managers} districts={districts} assets={assets} />
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("saveChanges")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
        </form>
      </Sheet>
    </div>
  );
}

/** The stages as a stepper. The filled bar slides to the current stage; managers click a stage to move the deal. */
export function StageStepper({ id, stage, canManage }: { id: string; stage: Stage; canManage: boolean }) {
  const t = useTranslations("deals");
  const router = useRouter();
  const [cur, setCur] = useState(stage);
  const [given, setGiven] = useState(stage);
  if (given !== stage) { setGiven(stage); setCur(stage); }
  const [reason, setReason] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const open = ["sourcing", "screening", "due_diligence", "offer", "negotiation"] as const;
  const idx = open.indexOf(cur as (typeof open)[number]);
  const move = (to: Stage, why = "") => {
    const before = cur;
    setCur(to); setErr(null);
    start(async () => {
      const r = await moveDealAction(id, { stage: to, reason: why });
      if (!r.ok) { setCur(before); setErr(t(`err_${r.error}`)); return; }
      setReason(null); router.refresh();
    });
  };
  const closed = cur === "won" || cur === "lost";
  return (
    <div className="space-y-3">
      <ol className="grid grid-cols-5 gap-1" aria-label={t("stages")}>
        {open.map((s, i) => {
          const done = closed ? cur === "won" : i <= idx;
          return (
            <li key={s} className="relative">
              <button type="button" disabled={!canManage || pending} aria-current={cur === s ? "step" : undefined} onClick={() => move(s)}
                className={cn("w-full rounded-md px-1 pb-2 pt-1 text-center text-xs disabled:cursor-default", cur === s ? "font-semibold text-gold" : "text-muted", canManage && "hover:bg-surface-2")}>
                {t(`s_${s}`)}
              </button>
              <span className="absolute inset-x-1 bottom-0 h-1 rounded-full bg-surface-2">
                {done && <motion.span layoutId={`step-${id}-${i}`} className={cn("absolute inset-0 rounded-full", cur === "lost" ? "bg-danger" : "bg-gold-fill")} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} style={{ originX: 0 }} transition={{ type: "spring", bounce: 0, visualDuration: 0.35, delay: i * 0.05 }} />}
              </span>
            </li>
          );
        })}
      </ol>
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {cur !== "won" && <Button size="sm" variant="outline" disabled={pending} onClick={() => move("won")}>{t("markWon")}</Button>}
          {cur !== "lost" && reason === null && <Button size="sm" variant="ghost" disabled={pending} onClick={() => setReason("")}>{t("markLost")}</Button>}
          {closed && <Button size="sm" variant="ghost" disabled={pending} onClick={() => move("negotiation")}>{t("reopen")}</Button>}
        </div>
      )}
      {reason !== null && (
        <form onSubmit={(e) => { e.preventDefault(); if (reason.trim().length >= 3) move("lost", reason.trim()); }} className="flex flex-wrap items-end gap-2">
          <label className="min-w-60 flex-1 text-sm"><span className={label}>{t("lostReason")}</span><input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={300} className={field} /></label>
          <Button type="submit" size="sm" variant="gold" disabled={pending}>{t("markLost")}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setReason(null)}>{t("cancel")}</Button>
        </form>
      )}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </div>
  );
}

export function DealNote({ id }: { id: string }) {
  const t = useTranslations("deals");
  const router = useRouter();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addDealNoteAction(id, text); if (!r.ok) { setErr(t(`err_${r.error}`)); return; } setText(""); setErr(null); router.refresh(); }); }} className="space-y-2">
      <label htmlFor={`note-${id}`} className={label}>{t("addNote")}</label>
      <textarea id={`note-${id}`} value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} className={`${field} py-2`} />
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <Button type="submit" size="sm" variant="outline" disabled={pending || text.trim().length < 2}>{t("saveNote")}</Button>
    </form>
  );
}

