"use client";
import { useId, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, CheckCircle2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { createEventAction, deleteEventAction, updateEventAction } from "@/app/calendar-actions";
import { Button } from "../ui";

const KINDS = ["meeting", "inspection", "viewing", "deadline", "other"] as const;
const field = "min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm";
const label = "mb-1 block text-sm font-semibold";
type Option = { id: string; name: string; nameAr: string; role?: string };
type Clash = { id: string; title: string; titleAr: string | null; start: string | null };
export interface EventValues { title: string; titleAr: string | null; kind: string; date: string; startTime: string | null; endTime: string | null; assetId: string | null; location: string; notes: string; shared: boolean; attendees: string[] }

function Sheet({ title, open, onOpenChange, children }: { title: string; open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) {
  const t = useTranslations("cal");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-x-2 bottom-2 z-[61] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-md sm:inset-x-auto sm:start-1/2 sm:top-[6vh] sm:bottom-auto sm:max-h-[88vh] sm:w-[32rem] sm:-translate-x-1/2 sm:rtl:translate-x-1/2">
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

function ClashNote({ clashes }: { clashes: Clash[] }) {
  const t = useTranslations("cal");
  const ar = useLocale() === "ar";
  if (!clashes.length) return null;
  return (
    <p role="status" className="flex items-start gap-1.5 text-sm text-gold">
      <AlertTriangle aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
      {t("clash", { list: clashes.map((c) => `${(ar && c.titleAr) || c.title}${c.start ? ` (${c.start})` : ""}`).join(ar ? "، " : ", ") })}
    </p>
  );
}

/** The fields shared by "new event" and "edit event". */
function EventFields({ v, people, assets, me }: { v?: EventValues; people: Option[]; assets: Option[]; me: string }) {
  const t = useTranslations("cal");
  const ar = useLocale() === "ar";
  const id = useId();
  const [allDay, setAllDay] = useState(v ? !v.startTime : false);
  const [kind, setKind] = useState(v?.kind ?? "meeting");
  return (
    <>
      <div><label htmlFor={`${id}-t`} className={label}>{t("fTitle")}<span aria-hidden="true" className="text-danger"> *</span></label><input id={`${id}-t`} name="title" required minLength={3} maxLength={120} defaultValue={v?.title} className={field} /></div>
      <div><label htmlFor={`${id}-ta`} className={label}>{t("fTitleAr")}</label><input id={`${id}-ta`} name="titleAr" dir="rtl" lang="ar" maxLength={120} defaultValue={v?.titleAr ?? ""} className={field} /></div>
      <div><label htmlFor={`${id}-k`} className={label}>{t("fKind")}</label>
        <select id={`${id}-k`} name="kind" value={kind} onChange={(e) => { setKind(e.target.value); if (e.target.value === "deadline") setAllDay(true); }} className={field}>{KINDS.map((k) => <option key={k} value={k}>{t(`k_${k}`)}</option>)}</select></div>
      <div><label htmlFor={`${id}-d`} className={label}>{t("fDate")}<span aria-hidden="true" className="text-danger"> *</span></label><input id={`${id}-d`} name="date" type="date" dir="ltr" required defaultValue={v?.date} className={field} /></div>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-5 accent-[var(--gold-fill)]" />{t("fAllDay")}</label>
      {!allDay && (
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor={`${id}-s`} className={label}>{t("fStart")}<span aria-hidden="true" className="text-danger"> *</span></label><input id={`${id}-s`} name="startTime" type="time" dir="ltr" required defaultValue={v?.startTime ?? "10:00"} className={field} /></div>
          <div><label htmlFor={`${id}-e`} className={label}>{t("fEnd")}</label><input id={`${id}-e`} name="endTime" type="time" dir="ltr" defaultValue={v?.endTime ?? "11:00"} className={field} /></div>
        </div>
      )}
      <div><label htmlFor={`${id}-a`} className={label}>{t("fAsset")}</label>
        <select id={`${id}-a`} name="assetId" defaultValue={v?.assetId ?? ""} className={field}><option value="">{t("noAsset")}</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.id}: {ar ? a.nameAr : a.name}</option>)}</select></div>
      <div><label htmlFor={`${id}-l`} className={label}>{t("fLocation")}</label><input id={`${id}-l`} name="location" maxLength={160} defaultValue={v?.location} className={field} /></div>
      <div><label htmlFor={`${id}-n`} className={label}>{t("fNotes")}</label><textarea id={`${id}-n`} name="notes" rows={3} maxLength={1000} defaultValue={v?.notes} className={`${field} py-2`} /></div>
      <fieldset><legend className={label}>{t("fPeople")}</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {people.map((p) => (
            <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="attendees" value={p.id} defaultChecked={v ? v.attendees.includes(p.id) : p.id === me} className="size-5 accent-[var(--gold-fill)]" />{ar ? p.nameAr : p.name}{p.role === "investor" && <span className="text-xs text-muted">({t("investor")})</span>}</label>
          ))}
        </div>
      </fieldset>
      <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" name="shared" defaultChecked={v?.shared ?? false} className="mt-0.5 size-5 shrink-0 accent-[var(--gold-fill)]" /><span><span className="block">{t("fShared")}</span><span className="text-xs text-muted">{t("fSharedHelp")}</span></span></label>
    </>
  );
}

const payload = (fd: FormData) => ({ ...Object.fromEntries([...fd.entries()].filter(([k]) => k !== "attendees")), attendees: fd.getAll("attendees").map(String) });

/** New event: a sheet with the form; after saving, the event page opens. Clashes are shown, not blocked. */
export function NewEvent({ people, assets, me, defaultDate }: { people: Option[]; assets: Option[]; me: string; defaultDate: string }) {
  const t = useTranslations("cal");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      setErr(null);
      const r = await createEventAction(payload(fd));
      if (!r.ok) { setErr(t(`err_${r.error}`)); return; }
      setOpen(false);
      const q = r.clashes.length ? `?created=1&clash=${r.clashes.map((c) => c.id).join(",")}` : "?created=1";
      router.push(`/calendar/${r.id}${q}`);
    });
  };
  return (
    <>
      <Button variant="gold" size="sm" onClick={() => { setErr(null); setOpen(true); }}><Plus aria-hidden="true" size={14} />{t("new")}</Button>
      <Sheet title={t("new")} open={open} onOpenChange={setOpen}>
        <form onSubmit={submit} className="space-y-3">
          <EventFields v={{ title: "", titleAr: null, kind: "meeting", date: defaultDate, startTime: "10:00", endTime: "11:00", assetId: null, location: "", notes: "", shared: false, attendees: [me] }} people={people} assets={assets} me={me} />
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("save")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
        </form>
      </Sheet>
    </>
  );
}

/** Edit and delete, on the event's own page. */
export function EventActions({ id, v, people, assets, me }: { id: string; v: EventValues; people: Option[]; assets: Option[]; me: string }) {
  const t = useTranslations("cal");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [clashes, setClashes] = useState<Clash[]>([]);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      setErr(null);
      const r = await updateEventAction(id, payload(fd));
      if (!r.ok) { setErr(t(`err_${r.error}`)); return; }
      setOpen(false); setClashes(r.clashes);
      setDone(r.changed.length ? t("updated", { n: r.changed.length, seq: r.auditSeq ?? 0 }) : t("noChanges"));
      router.refresh();
    });
  };
  const remove = () => start(async () => {
    const r = await deleteEventAction(id);
    if (!r.ok) { setErr(t(`err_${r.error}`)); return; }
    router.push(`/calendar?m=${v.date.slice(0, 7)}&deleted=${id}`);
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => { setErr(null); setOpen(true); }}><Pencil aria-hidden="true" size={14} />{t("edit")}</Button>
        {!confirm ? <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}><Trash2 aria-hidden="true" size={14} />{t("delete")}</Button> : (
          <span className="flex flex-wrap items-center gap-2 text-sm">{t("deleteConfirm")}<Button size="sm" variant="outline" className="border-danger text-danger" disabled={pending} onClick={remove}>{t("deleteYes")}</Button><Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>{t("cancel")}</Button></span>
        )}
      </div>
      {done && <p role="status" className="flex items-start gap-1.5 text-sm text-ok"><CheckCircle2 aria-hidden="true" size={16} className="mt-0.5 shrink-0" />{done}</p>}
      <ClashNote clashes={clashes} />
      {err && !open && <p role="alert" className="text-sm text-danger">{err}</p>}
      <Sheet title={t("editTitle")} open={open} onOpenChange={setOpen}>
        <form onSubmit={submit} className="space-y-3">
          <EventFields v={v} people={people} assets={assets} me={me} />
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("saveChanges")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
        </form>
      </Sheet>
    </div>
  );
}
