"use client";
import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarClock, CheckCircle2, Play, Plus, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { createScheduleAction, runDueReportsAction, runScheduleNowAction, setScheduleActiveAction } from "@/app/report-actions";
import { Button } from "../ui";

const field = "min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm";
const label = "mb-1 block text-sm font-semibold";
const Done = ({ text }: { text: string }) => <p role="status" className="flex items-start gap-1.5 text-sm text-ok"><CheckCircle2 aria-hidden="true" size={16} className="mt-0.5 shrink-0" />{text}</p>;

export function RunNow({ id }: { id: string }) {
  const t = useTranslations("rep");
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
        const r = await runScheduleNowAction(id);
        setMsg(r.ok ? { ok: true, text: t("ranMsg", { run: r.runId, n: r.recipients, next: r.nextRunOn }) } : { ok: false, text: t(`err_${r.error}` as "err_invalid") });
        if (r.ok) router.refresh();
      })}><Play aria-hidden="true" size={13} />{pending ? t("running") : t("runNow")}</Button>
      {msg && (msg.ok ? <Done text={msg.text} /> : <span role="alert" className="text-xs text-danger">{msg.text}</span>)}
    </div>
  );
}

export function ActiveToggle({ id, active, name }: { id: string; active: boolean; name: string }) {
  const t = useTranslations("rep");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" checked={active} disabled={pending} aria-label={t("activeFor", { name })} onChange={(e) => { const v = e.target.checked; start(async () => { await setScheduleActiveAction(id, v); router.refresh(); }); }} className="size-4 accent-[var(--gold-fill)]" />
      {active ? t("active") : t("paused")}
    </label>
  );
}

export function RunDue() {
  const t = useTranslations("rep");
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => {
        const r = await runDueReportsAction();
        setMsg(r.ok ? t("dueRan", { n: r.ran.length }) : t("err_forbidden"));
        router.refresh();
      })}><CalendarClock aria-hidden="true" size={14} />{t("runDue")}</Button>
      {msg && <Done text={msg} />}
    </div>
  );
}

export function NewSchedule({ datasets }: { datasets: { id: string; label: string }[] }) {
  const t = useTranslations("rep");
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("workbook_management");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (fd: FormData) => start(async () => {
    setErr(null);
    const r = await createScheduleAction({ name: fd.get("name"), kind: fd.get("kind"), datasets: fd.getAll("datasets"), frequency: fd.get("frequency"), dayOfMonth: fd.get("dayOfMonth"), recipients: fd.get("recipients"), lang: fd.get("lang") });
    if (!r.ok) { setErr(t(`err_${r.error}` as "err_invalid")); return; }
    setDone(t("scheduled", { id: r.id, next: r.nextRunOn })); setOpen(false); router.refresh();
  });
  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="gold" size="sm" onClick={() => { setDone(null); setOpen(true); }}><Plus aria-hidden="true" size={14} />{t("newSchedule")}</Button>
      {done && <Done text={done} />}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
          <Dialog.Content aria-describedby={undefined} className="fixed inset-x-2 bottom-2 z-[61] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-md sm:inset-x-auto sm:start-1/2 sm:top-[6vh] sm:bottom-auto sm:w-[32rem] sm:-translate-x-1/2 sm:rtl:translate-x-1/2">
            <div className="mb-3 flex items-start justify-between gap-3">
              <Dialog.Title className="font-display text-xl">{t("newSchedule")}</Dialog.Title>
              <Dialog.Close className="grid size-10 shrink-0 place-items-center rounded-md hover:bg-surface-2" aria-label={t("close")}><X aria-hidden="true" size={16} /></Dialog.Close>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }} className="space-y-3">
              <div><label htmlFor={`${id}-n`} className={label}>{t("name")}</label><input id={`${id}-n`} name="name" required minLength={3} maxLength={80} className={field} /></div>
              <div><label htmlFor={`${id}-k`} className={label}>{t("kind")}</label>
                <select id={`${id}-k`} name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>{(["workbook_management", "workbook_investor", "statement"] as const).map((k) => <option key={k} value={k}>{t(`k_${k}`)}</option>)}</select>
                <p className="mt-1 text-xs text-muted">{t(`kHelp_${kind}` as "kHelp_statement")}</p></div>
              {kind !== "statement" && (
                <fieldset><legend className={label}>{t("sheets")}</legend>
                  <div className="grid grid-cols-2 gap-x-4">{datasets.map((d) => <label key={d.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="datasets" value={d.id} defaultChecked={["holdings", "work"].includes(d.id)} />{d.label}</label>)}</div>
                </fieldset>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor={`${id}-f`} className={label}>{t("frequency")}</label><select id={`${id}-f`} name="frequency" className={field} defaultValue="monthly"><option value="monthly">{t("f_monthly")}</option><option value="quarterly">{t("f_quarterly")}</option></select></div>
                <div><label htmlFor={`${id}-d`} className={label}>{t("dayOfMonth")}</label><input id={`${id}-d`} name="dayOfMonth" type="number" dir="ltr" min={1} max={28} defaultValue={1} className={field} /></div>
              </div>
              <div><label htmlFor={`${id}-r`} className={label}>{t("recipients")}</label><input id={`${id}-r`} name="recipients" required dir="ltr" placeholder="name@example.com, other@example.com" className={field} /><p className="mt-1 text-xs text-muted">{t("recipientsHelp")}</p></div>
              <div><label htmlFor={`${id}-l`} className={label}>{t("language")}</label><select id={`${id}-l`} name="lang" className={field} defaultValue="en"><option value="en">English</option><option value="ar">العربية</option></select></div>
              {err && <p role="alert" className="text-sm text-danger">{err}</p>}
              <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("schedule")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
