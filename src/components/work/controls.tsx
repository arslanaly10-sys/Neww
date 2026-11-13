"use client";
import { useId, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, Pause, Play, Plus, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { addWorkNoteAction, completeWorkAction, createWorkAction, updateWorkAction } from "@/app/work-actions";
import { Button } from "../ui";

const CATS = ["plumbing", "electrical", "hvac", "lift", "structural", "cleaning", "admin", "other"] as const;
const PRIS = ["urgent", "high", "normal", "low"] as const;
const field = "min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm";
const label = "mb-1 block text-sm font-semibold";
type Person = { id: string; name: string; nameAr: string };
const Done = ({ text }: { text: string }) => <p role="status" className="flex items-start gap-1.5 text-sm text-ok"><CheckCircle2 aria-hidden="true" size={16} className="mt-0.5 shrink-0" />{text}</p>;
const submitWith = (fn: (fd: FormData) => void) => (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); fn(new FormData(e.currentTarget)); };

function Sheet({ title, open, onOpenChange, children }: { title: string; open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) {
  const t = useTranslations("work");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-x-2 bottom-2 z-[61] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-md sm:inset-x-auto sm:start-1/2 sm:top-[8vh] sm:bottom-auto sm:w-[30rem] sm:-translate-x-1/2 sm:rtl:translate-x-1/2">
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

/** Report a problem or add a task. Investors report maintenance only; managers can also assign, schedule and estimate. */
export function NewWork({ assets, managers, canManage, defaultAssetId, today }: { assets: Person[]; managers: Person[]; canManage: boolean; defaultAssetId?: string; today: string }) {
  const t = useTranslations("work");
  const locale = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"maintenance" | "task">("maintenance");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (fd: FormData) => start(async () => {
    setErr(null);
    const r = await createWorkAction(Object.fromEntries(fd.entries()));
    if (!r.ok) { setErr(t(`err_${r.error}` as "err_invalid")); return; }
    setDone(t("created", { id: r.id, seq: r.auditSeq })); setOpen(false); router.refresh();
  });
  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="gold" size="sm" onClick={() => { setDone(null); setOpen(true); }}><Plus aria-hidden="true" size={14} />{canManage ? t("new") : t("report")}</Button>
      {done && <Done text={done} />}
      <Sheet title={canManage ? t("new") : t("report")} open={open} onOpenChange={setOpen}>
        <form onSubmit={submitWith(submit)} className="space-y-3">
          {canManage && (
            <fieldset><legend className={label}>{t("kind")}</legend>
              <div className="flex gap-4 text-sm">{(["maintenance", "task"] as const).map((k) => <label key={k} className="flex min-h-11 items-center gap-2"><input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />{t(`k_${k}`)}</label>)}</div>
            </fieldset>
          )}
          {!canManage && <input type="hidden" name="kind" value="maintenance" />}
          <div><label htmlFor={`${id}-a`} className={label}>{t("asset")}{kind === "maintenance" && <span aria-hidden="true" className="text-danger"> *</span>}</label>
            <select id={`${id}-a`} name="assetId" defaultValue={defaultAssetId ?? ""} required={kind === "maintenance"} className={field}>
              <option value="">{kind === "maintenance" ? t("chooseAsset") : t("noAsset")}</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.id}: {ar ? a.nameAr : a.name}</option>)}
            </select></div>
          <div><label htmlFor={`${id}-t`} className={label}>{t("titleLabel")}<span aria-hidden="true" className="text-danger"> *</span></label><input id={`${id}-t`} name="title" required minLength={4} maxLength={120} className={field} /></div>
          <div><label htmlFor={`${id}-c`} className={label}>{t("category")}</label>
            <select id={`${id}-c`} name="category" defaultValue={kind === "task" ? "admin" : "plumbing"} key={kind} className={field}>{CATS.map((c) => <option key={c} value={c}>{t(`c_${c}`)}</option>)}</select></div>
          <div><label htmlFor={`${id}-d`} className={label}>{t("description")}</label><textarea id={`${id}-d`} name="description" rows={3} maxLength={1000} className={`${field} py-2`} /></div>
          {canManage && (
            <>
              <div><label htmlFor={`${id}-p`} className={label}>{t("priority")}</label><select id={`${id}-p`} name="priority" defaultValue="normal" className={field}>{PRIS.map((p) => <option key={p} value={p}>{t(`p_${p}`)}</option>)}</select></div>
              <div><label htmlFor={`${id}-w`} className={label}>{t("assignee")}</label><select id={`${id}-w`} name="assigneeId" defaultValue="" className={field}><option value="">{t("unassigned")}</option>{managers.map((m) => <option key={m.id} value={m.id}>{ar ? m.nameAr : m.name}</option>)}</select></div>
              <div><label htmlFor={`${id}-u`} className={label}>{t("due")}</label><input id={`${id}-u`} name="dueOn" type="date" dir="ltr" min={today} className={field} /></div>
              {kind === "maintenance" && <div><label htmlFor={`${id}-e`} className={label}>{t("estimate")}</label><input id={`${id}-e`} name="estimateEgp" type="number" inputMode="numeric" dir="ltr" min={1} className={field} /></div>}
            </>
          )}
          {!canManage && <p className="text-xs text-muted">{t("reportNote")}</p>}
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{canManage ? t("create") : t("send")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
        </form>
      </Sheet>
    </div>
  );
}

/** The one next step for a card on the board: start, put on hold, resume, or finish. */
export function NextStep({ id, kind, status, title, estimateEgp }: { id: string; kind: string; status: string; title: string; estimateEgp: number | null }) {
  const t = useTranslations("work");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const move = (to: string) => start(async () => {
    setErr(null);
    const r = await updateWorkAction(id, { status: to });
    if (!r.ok) setErr(t(`err_${r.error}` as "err_invalid")); else router.refresh();
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "open" && <Button size="sm" variant="outline" disabled={pending} onClick={() => move("in_progress")}><Play aria-hidden="true" size={13} />{t("start")}</Button>}
      {status === "in_progress" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => move("on_hold")}><Pause aria-hidden="true" size={13} />{t("hold")}</Button>}
      {status === "on_hold" && <Button size="sm" variant="outline" disabled={pending} onClick={() => move("in_progress")}><Play aria-hidden="true" size={13} />{t("resume")}</Button>}
      {(status === "in_progress" || status === "open") && <CompleteWork id={id} kind={kind} title={title} estimateEgp={estimateEgp} compact />}
      {err && <span role="alert" className="text-xs text-danger">{err}</span>}
    </div>
  );
}

/** Finish a job. A maintenance job's actual cost goes to the finance ledger. */
export function CompleteWork({ id, kind, title, estimateEgp, compact }: { id: string; kind: string; title: string; estimateEgp: number | null; compact?: boolean }) {
  const t = useTranslations("work");
  const router = useRouter();
  const fid = useId();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) return <Done text={done} />;
  const submit = (fd: FormData) => start(async () => {
    setErr(null);
    const r = await completeWorkAction(id, { actualEgp: fd.get("actualEgp") ?? "", note: fd.get("note") });
    if (!r.ok) { setErr(t(`err_${r.error}` as "err_invalid")); return; }
    setDone(r.ledgerEntryId ? t("completedLedger", { entry: r.ledgerEntryId, seq: r.auditSeq }) : t("completed", { seq: r.auditSeq })); setOpen(false); router.refresh();
  });
  return (
    <>
      <Button size="sm" variant={compact ? "ghost" : "gold"} onClick={() => setOpen(true)}><CheckCircle2 aria-hidden="true" size={13} />{t("complete")}</Button>
      <Sheet title={t("completeTitle", { what: title })} open={open} onOpenChange={setOpen}>
        <form onSubmit={submitWith(submit)} className="space-y-3">
          {kind === "maintenance" && (
            <div><label htmlFor={`${fid}-c`} className={label}>{t("actual")}</label><input id={`${fid}-c`} name="actualEgp" type="number" inputMode="numeric" dir="ltr" min={0} defaultValue={estimateEgp ?? ""} className={field} />
              <p className="mt-1 text-xs text-muted">{t("actualHelp")}</p></div>
          )}
          <div><label htmlFor={`${fid}-n`} className={label}>{t("noteOptional")}</label><textarea id={`${fid}-n`} name="note" rows={2} maxLength={500} className={`${field} py-2`} /></div>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("completeConfirm")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
        </form>
      </Sheet>
    </>
  );
}

/** Everything a manager can change on an open work order, saved together. */
export function WorkEditor({ work, managers }: { work: { id: string; status: string; priority: string; assigneeId: string | null; vendor: string; dueOn: string | null; estimateEgp: number | null; kind: string }; managers: Person[] }) {
  const t = useTranslations("work");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const submit = (fd: FormData) => start(async () => {
    setMsg(null);
    const r = await updateWorkAction(work.id, Object.fromEntries(fd.entries()));
    if (!r.ok) { setMsg({ ok: false, text: t(`err_${r.error}` as "err_invalid") }); return; }
    setMsg({ ok: true, text: r.changed.length ? t("saved", { n: r.changed.length, seq: r.auditSeq ?? 0 }) : t("nothingChanged") });
    router.refresh();
  });
  return (
    <form onSubmit={submitWith(submit)} className="grid gap-3 sm:grid-cols-2">
      <div><label htmlFor={`${id}-s`} className={label}>{t("status")}</label><select id={`${id}-s`} name="status" defaultValue={work.status} className={field}>{(["open", "in_progress", "on_hold", "cancelled"] as const).map((s) => <option key={s} value={s}>{t(`s_${s}`)}</option>)}</select></div>
      <div><label htmlFor={`${id}-p`} className={label}>{t("priority")}</label><select id={`${id}-p`} name="priority" defaultValue={work.priority} className={field}>{PRIS.map((p) => <option key={p} value={p}>{t(`p_${p}`)}</option>)}</select></div>
      <div><label htmlFor={`${id}-w`} className={label}>{t("assignee")}</label><select id={`${id}-w`} name="assigneeId" defaultValue={work.assigneeId ?? ""} className={field}><option value="">{t("unassigned")}</option>{managers.map((m) => <option key={m.id} value={m.id}>{locale === "ar" ? m.nameAr : m.name}</option>)}</select></div>
      <div><label htmlFor={`${id}-v`} className={label}>{t("vendor")}</label><input id={`${id}-v`} name="vendor" defaultValue={work.vendor} maxLength={120} className={field} /></div>
      <div><label htmlFor={`${id}-d`} className={label}>{t("due")}</label><input id={`${id}-d`} name="dueOn" type="date" dir="ltr" defaultValue={work.dueOn ?? ""} className={field} /></div>
      {work.kind === "maintenance" && <div><label htmlFor={`${id}-e`} className={label}>{t("estimate")}</label><input id={`${id}-e`} name="estimateEgp" type="number" inputMode="numeric" dir="ltr" min={1} defaultValue={work.estimateEgp ?? ""} className={field} /></div>}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" variant="outline" disabled={pending}>{t("saveChanges")}</Button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-ok" : "text-sm text-danger"}>{msg.text}</p>}
      </div>
    </form>
  );
}

export function NoteForm({ id }: { id: string }) {
  const t = useTranslations("work");
  const router = useRouter();
  const fid = useId();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); start(async () => {
      setErr(null);
      const r = await addWorkNoteAction(id, text);
      if (!r.ok) { setErr(t(`err_${r.error}` as "err_invalid")); return; }
      setText(""); router.refresh();
    }); }}>
      <label htmlFor={`${fid}-n`} className={label}>{t("addNote")}</label>
      <textarea id={`${fid}-n`} rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} className={`${field} py-2`} />
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <Button type="submit" size="sm" variant="outline" disabled={pending || text.trim().length < 2}>{t("postNote")}</Button>
    </form>
  );
}
