"use client";
import { useId, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useInView } from "motion/react";
import { CheckCircle2, Plus, Star, Trash2, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { addReadingAction, assignContractorAction, createContractorAction, decideCapexAction, proposeCapexAction, rateWorkAction, recordInspectionAction, scheduleInspectionAction, updateCapexAction } from "@/app/ops-actions";
import { cn } from "@/lib/cn";
import { Button } from "../ui";

const field = "min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm";
const label = "mb-1 block text-sm font-semibold";
type Opt = { id: string; name: string; nameAr: string };
const Done = ({ text }: { text: string }) => <motion.p role="status" initial={{ y: 4 }} animate={{ y: 0 }} className="flex items-center gap-1.5 text-sm text-ok"><CheckCircle2 aria-hidden="true" size={16} />{text}</motion.p>;
const entries = (e: React.FormEvent<HTMLFormElement>) => Object.fromEntries(new FormData(e.currentTarget).entries());

function Sheet({ title, open, onOpenChange, children }: { title: string; open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) {
  const t = useTranslations("ops");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-x-2 bottom-2 z-[61] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-md sm:inset-x-auto sm:start-1/2 sm:top-[5vh] sm:bottom-auto sm:max-h-[90vh] sm:w-[34rem] sm:-translate-x-1/2 sm:rtl:translate-x-1/2">
          <div className="mb-3 flex items-start justify-between gap-3"><Dialog.Title className="font-display text-xl">{title}</Dialog.Title><Dialog.Close className="grid size-10 place-items-center rounded-md hover:bg-surface-2" aria-label={t("close")}><X aria-hidden="true" size={16} /></Dialog.Close></div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
const nm = (o: Opt, ar: boolean) => (ar ? o.nameAr : o.name);

export function NewContractor({ trades }: { trades: readonly string[] }) {
  const t = useTranslations("ops");
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="gold" onClick={() => { setErr(null); setOpen(true); }}><Plus aria-hidden="true" size={14} />{t("newContractor")}</Button>
      {done && <Done text={done} />}
      <Sheet title={t("newContractor")} open={open} onOpenChange={setOpen}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const fd = entries(e); start(async () => { const r = await createContractorAction(fd); if (!r.ok) { setErr(t(`err_${r.error}`)); return; } setOpen(false); setDone(t("contractorAdded", { id: r.id })); router.refresh(); }); }}>
          <div><label htmlFor={`${id}-n`} className={label}>{t("fName")}</label><input id={`${id}-n`} name="name" required minLength={2} maxLength={100} className={field} /></div>
          <div><label htmlFor={`${id}-na`} className={label}>{t("fNameAr")}</label><input id={`${id}-na`} name="nameAr" dir="rtl" lang="ar" maxLength={100} className={field} /></div>
          <div><label htmlFor={`${id}-t`} className={label}>{t("fTrade")}</label><select id={`${id}-t`} name="trade" className={field}>{trades.map((x) => <option key={x} value={x}>{t(`tr_${x}`)}</option>)}</select></div>
          <div><label htmlFor={`${id}-e`} className={label}>{t("fEmail")}</label><input id={`${id}-e`} name="email" type="email" dir="ltr" required className={field} /></div>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("add")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
        </form>
      </Sheet>
    </div>
  );
}

/** On a work order: which contractor does it, and (once done) how well. */
export function ContractorPanel({ workId, status, contractorId, rating, contractors }: { workId: string; status: string; contractorId: string | null; rating: number | null; contractors: Opt[] }) {
  const t = useTranslations("ops");
  const ar = useLocale() === "ar";
  const router = useRouter();
  const id = useId();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const closed = status === "done" || status === "cancelled";
  return (
    <div className="space-y-2 text-sm">
      {!closed ? (
        <div><label htmlFor={`${id}-c`} className={label}>{t("contractor")}</label>
          <select id={`${id}-c`} defaultValue={contractorId ?? ""} disabled={pending} onChange={(e) => start(async () => { const r = await assignContractorAction(workId, e.target.value || null); if (!r.ok) setErr(t(`err_${r.error}`)); else { setErr(null); setMsg(t("contractorSaved")); router.refresh(); } })} className={field}>
            <option value="">{t("noContractor")}</option>{contractors.map((c) => <option key={c.id} value={c.id}>{nm(c, ar)}</option>)}
          </select></div>
      ) : contractorId ? (
        <fieldset><legend className={label}>{t("rateJob")}</legend>
          <div className="flex gap-1" role="radiogroup" aria-label={t("rateJob")}>
            {[1, 2, 3, 4, 5].map((n) => (
              <motion.button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={t("stars", { n })} whileTap={{ scale: 0.85 }} disabled={pending}
                onClick={() => start(async () => { const r = await rateWorkAction(workId, n); if (!r.ok) setErr(t(`err_${r.error}`)); else { setErr(null); setMsg(t("rated", { n })); router.refresh(); } })}
                className="grid size-10 place-items-center rounded-md hover:bg-surface-2">
                <Star aria-hidden="true" size={20} className={cn((rating ?? 0) >= n ? "fill-gold-fill text-gold" : "text-muted")} />
              </motion.button>
            ))}
          </div>
        </fieldset>
      ) : null}
      {msg && <Done text={msg} />}
      {err && <p role="alert" className="text-danger">{err}</p>}
    </div>
  );
}

export function ScheduleInspection({ assets, managers, contractors, kinds, me, today }: { assets: Opt[]; managers: Opt[]; contractors: Opt[]; kinds: readonly string[]; me: string; today: string }) {
  const t = useTranslations("ops");
  const ar = useLocale() === "ar";
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="gold" onClick={() => { setErr(null); setOpen(true); }}><Plus aria-hidden="true" size={14} />{t("schedule")}</Button>
      {done && <Done text={done} />}
      <Sheet title={t("schedule")} open={open} onOpenChange={setOpen}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const fd = entries(e); start(async () => { const r = await scheduleInspectionAction(fd); if (!r.ok) { setErr(t(`err_${r.error}`)); return; } setOpen(false); setDone(t("scheduled", { id: r.id })); router.refresh(); }); }}>
          <div><label htmlFor={`${id}-a`} className={label}>{t("asset")}</label><select id={`${id}-a`} name="assetId" required className={field}>{assets.map((a) => <option key={a.id} value={a.id}>{a.id}: {nm(a, ar)}</option>)}</select></div>
          <div><label htmlFor={`${id}-k`} className={label}>{t("kind")}</label><select id={`${id}-k`} name="kind" className={field}>{kinds.map((k) => <option key={k} value={k}>{t(`ik_${k}`)}</option>)}</select></div>
          <div><label htmlFor={`${id}-d`} className={label}>{t("date")}</label><input id={`${id}-d`} name="scheduledOn" type="date" dir="ltr" required min={today} className={field} /></div>
          <div><label htmlFor={`${id}-i`} className={label}>{t("inspector")}</label><select id={`${id}-i`} name="inspectorId" defaultValue={me} className={field}>{managers.map((m) => <option key={m.id} value={m.id}>{nm(m, ar)}</option>)}</select></div>
          <div><label htmlFor={`${id}-c`} className={label}>{t("contractorOptional")}</label><select id={`${id}-c`} name="contractorId" className={field}><option value="">{t("noContractor")}</option>{contractors.map((c) => <option key={c.id} value={c.id}>{nm(c, ar)}</option>)}</select></div>
          <div><label htmlFor={`${id}-n`} className={label}>{t("notes")}</label><textarea id={`${id}-n`} name="notes" rows={2} maxLength={500} className={`${field} py-2`} /></div>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("schedule")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
        </form>
      </Sheet>
    </div>
  );
}

interface FindingDraft { key: number; area: string; severity: "low" | "medium" | "high"; note: string; createWork: boolean }

/** Record an inspection's result. Findings can be added and removed; any of them can become a work order. */
export function RecordInspection({ id, label: what }: { id: string; label: string }) {
  const t = useTranslations("ops");
  const router = useRouter();
  const fid = useId();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<"pass" | "issues" | "fail">("issues");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<FindingDraft[]>([{ key: 1, area: "", severity: "medium", note: "", createWork: true }]);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: number, patch: Partial<FindingDraft>) => setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const submit = () => start(async () => {
    const findings = result === "pass" ? [] : rows.filter((r) => r.area || r.note).map(({ area, severity, note, createWork }) => ({ area, severity, note, createWork }));
    const r = await recordInspectionAction(id, { result, notes, findings });
    if (!r.ok) { setErr(t(`err_${r.error}`)); return; }
    setOpen(false); setDone(r.created.length ? t("recordedWork", { list: r.created.join(", ") }) : t("recorded")); router.refresh();
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => { setErr(null); setOpen(true); }} aria-label={t("recordFor", { what })}>{t("record")}</Button>
      {done && <Done text={done} />}
      <Sheet title={t("recordTitle", { what })} open={open} onOpenChange={setOpen}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <fieldset><legend className={label}>{t("result")}</legend>
            <div className="flex flex-wrap gap-2">{(["pass", "issues", "fail"] as const).map((x) => <label key={x} className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm", result === x ? "border-gold-fill bg-gold-fill/15" : "border-line")}><input type="radio" name="result" value={x} checked={result === x} onChange={() => setResult(x)} className="sr-only" />{t(`rs_${x}`)}</label>)}</div>
          </fieldset>
          {result !== "pass" && (
            <fieldset className="space-y-2"><legend className={label}>{t("findings")}</legend>
              <AnimatePresence initial={false}>
                {rows.map((r, i) => (
                  <motion.div key={r.key} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }} className="rounded-lg border border-line p-3">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                      <div><label htmlFor={`${fid}-a${r.key}`} className="mb-1 block text-xs font-semibold">{t("fArea", { n: i + 1 })}</label><input id={`${fid}-a${r.key}`} value={r.area} onChange={(e) => set(r.key, { area: e.target.value })} required minLength={2} maxLength={80} className={field} /></div>
                      <div><label htmlFor={`${fid}-s${r.key}`} className="mb-1 block text-xs font-semibold">{t("severity")}</label><select id={`${fid}-s${r.key}`} value={r.severity} onChange={(e) => set(r.key, { severity: e.target.value as FindingDraft["severity"] })} className={field}>{(["low", "medium", "high"] as const).map((x) => <option key={x} value={x}>{t(`sv_${x}`)}</option>)}</select></div>
                    </div>
                    <label htmlFor={`${fid}-n${r.key}`} className="mb-1 mt-2 block text-xs font-semibold">{t("fNote")}</label><input id={`${fid}-n${r.key}`} value={r.note} onChange={(e) => set(r.key, { note: e.target.value })} required minLength={3} maxLength={300} className={field} />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={r.createWork} onChange={(e) => set(r.key, { createWork: e.target.checked })} className="size-5 accent-[var(--gold-fill)]" />{t("createWork")}</label>
                      {rows.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={t("removeFinding", { n: i + 1 })}><Trash2 aria-hidden="true" size={14} /></Button>}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <Button type="button" size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, { key: Math.max(...rs.map((x) => x.key)) + 1, area: "", severity: "low", note: "", createWork: false }])}><Plus aria-hidden="true" size={14} />{t("addFinding")}</Button>
            </fieldset>
          )}
          <div><label htmlFor={`${fid}-notes`} className={label}>{t("notes")}</label><textarea id={`${fid}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} className={`${field} py-2`} /></div>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("saveResult")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
        </form>
      </Sheet>
    </div>
  );
}

/** Consumption per period as bars that grow when seen; a flagged period is drawn in the warning colour and labelled. */
export function UsageBars({ periods, unit, label: name }: { periods: { to: string; use: number; anomaly: boolean }[]; unit: string; label: string }) {
  const t = useTranslations("ops");
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.4 });
  const max = Math.max(1, ...periods.map((p) => p.use));
  return (
    <div ref={ref}>
      <ol className="flex h-28 items-end gap-1" aria-label={t("usageOf", { name })}>
        {periods.map((p, i) => (
          <li key={p.to} className="flex h-full flex-1 flex-col justify-end" title={`${p.to}: ${p.use} ${unit}`}>
            <motion.span className={cn("block w-full rounded-t", p.anomaly ? "bg-danger" : "bg-gold-fill/80")} style={{ height: `${(p.use / max) * 100}%`, originY: 1 }}
              initial={{ scaleY: 0 }} animate={{ scaleY: seen ? 1 : 0 }} transition={{ type: "spring", bounce: 0, visualDuration: 0.5, delay: seen ? i * 0.03 : 0 }} />
            <span className="sr-only">{`${p.to}: ${p.use} ${unit}${p.anomaly ? `, ${t("spike")}` : ""}`}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AddReading({ assets, utilities, today }: { assets: Opt[]; utilities: readonly string[]; today: string }) {
  const t = useTranslations("ops");
  const ar = useLocale() === "ar";
  const router = useRouter();
  const id = useId();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-5 sm:items-end" onSubmit={(e) => { e.preventDefault(); const fd = entries(e); const form = e.currentTarget; start(async () => { const r = await addReadingAction(fd); setMsg(r.ok ? { ok: true, text: r.anomaly ? t("readingSpike") : t("readingSaved") } : { ok: false, text: t(`err_${r.error}`) }); if (r.ok) { form.reset(); router.refresh(); } }); }}>
      <div><label htmlFor={`${id}-a`} className={label}>{t("asset")}</label><select id={`${id}-a`} name="assetId" className={field}>{assets.map((a) => <option key={a.id} value={a.id}>{a.id}: {nm(a, ar)}</option>)}</select></div>
      <div><label htmlFor={`${id}-u`} className={label}>{t("utility")}</label><select id={`${id}-u`} name="utility" className={field}>{utilities.map((u) => <option key={u} value={u}>{t(`ut_${u}`)}</option>)}</select></div>
      <div><label htmlFor={`${id}-d`} className={label}>{t("readOn")}</label><input id={`${id}-d`} name="readOn" type="date" dir="ltr" required max={today} defaultValue={today} className={field} /></div>
      <div><label htmlFor={`${id}-r`} className={label}>{t("meterReading")}</label><input id={`${id}-r`} name="reading" type="number" dir="ltr" step="0.01" min={0} required className={field} /></div>
      <div><label htmlFor={`${id}-c`} className={label}>{t("billOptional")}</label><input id={`${id}-c`} name="costEgp" type="number" dir="ltr" min={0} className={field} /></div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-5"><Button type="submit" variant="gold" size="sm" disabled={pending}>{t("addReading")}</Button>{msg && (msg.ok ? <Done text={msg.text} /> : <p role="alert" className="text-sm text-danger">{msg.text}</p>)}</div>
    </form>
  );
}

export function ProposeCapex({ assets, contractors, categories }: { assets: Opt[]; contractors: Opt[]; categories: readonly string[] }) {
  const t = useTranslations("ops");
  const ar = useLocale() === "ar";
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="gold" onClick={() => { setErr(null); setOpen(true); }}><Plus aria-hidden="true" size={14} />{t("propose")}</Button>
      {done && <Done text={done} />}
      <Sheet title={t("propose")} open={open} onOpenChange={setOpen}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const fd = entries(e); start(async () => { const r = await proposeCapexAction(fd); if (!r.ok) { setErr(t(`err_${r.error}`)); return; } setOpen(false); setDone(t("proposed", { id: r.id })); router.refresh(); }); }}>
          <div><label htmlFor={`${id}-a`} className={label}>{t("asset")}</label><select id={`${id}-a`} name="assetId" className={field}>{assets.map((a) => <option key={a.id} value={a.id}>{a.id}: {nm(a, ar)}</option>)}</select></div>
          <div><label htmlFor={`${id}-t`} className={label}>{t("fTitle")}</label><input id={`${id}-t`} name="title" required minLength={4} maxLength={120} className={field} /></div>
          <div><label htmlFor={`${id}-ta`} className={label}>{t("fTitleAr")}</label><input id={`${id}-ta`} name="titleAr" dir="rtl" lang="ar" maxLength={120} className={field} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor={`${id}-c`} className={label}>{t("category")}</label><select id={`${id}-c`} name="category" className={field}>{categories.map((c) => <option key={c} value={c}>{t(`cx_${c}`)}</option>)}</select></div>
            <div><label htmlFor={`${id}-b`} className={label}>{t("budget")}</label><input id={`${id}-b`} name="budgetEgp" type="number" dir="ltr" min={1} required className={field} /></div>
            <div><label htmlFor={`${id}-l`} className={label}>{t("life")}</label><input id={`${id}-l`} name="usefulLifeYears" type="number" dir="ltr" min={1} max={60} className={field} /></div>
            <div><label htmlFor={`${id}-u`} className={label}>{t("uplift")}</label><input id={`${id}-u`} name="expectedUpliftEgp" type="number" dir="ltr" min={0} className={field} /></div>
            <div><label htmlFor={`${id}-s`} className={label}>{t("startOn")}</label><input id={`${id}-s`} name="startOn" type="date" dir="ltr" className={field} /></div>
            <div><label htmlFor={`${id}-k`} className={label}>{t("contractorOptional")}</label><select id={`${id}-k`} name="contractorId" className={field}><option value="">{t("noContractor")}</option>{contractors.map((c) => <option key={c.id} value={c.id}>{nm(c, ar)}</option>)}</select></div>
          </div>
          <div><label htmlFor={`${id}-n`} className={label}>{t("why")}</label><textarea id={`${id}-n`} name="note" rows={2} maxLength={500} className={`${field} py-2`} /></div>
          <p className="text-xs text-muted">{t("proposeNote")}</p>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2"><Button type="submit" variant="gold" disabled={pending}>{t("sendForApproval")}</Button><Dialog.Close asChild><Button type="button" variant="ghost">{t("cancel")}</Button></Dialog.Close></div>
        </form>
      </Sheet>
    </div>
  );
}

/** Approve or reject (a different manager), or record progress on approved works. */
export function CapexActions({ id, status, mine, spent, label: what }: { id: string; status: string; mine: boolean; spent: number; label: string }) {
  const t = useTranslations("ops");
  const router = useRouter();
  const fid = useId();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; overBudget?: boolean }>, ok: string) => start(async () => { const r = await fn(); if (!r.ok) { setErr(t(`err_${r.error}`)); return; } setErr(null); setMsg(r.overBudget ? t("overBudgetNow") : ok); router.refresh(); });
  if (status === "proposed") return mine ? <p className="text-xs text-muted">{t("waitingOther")}</p> : (
    <div className="space-y-2">
      <label htmlFor={`${fid}-n`} className="sr-only">{t("decisionNote")}</label>
      <input id={`${fid}-n`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("decisionNote")} maxLength={300} className={field} />
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="gold" disabled={pending} onClick={() => run(() => decideCapexAction(id, "approve", note), t("approvedMsg"))} aria-label={t("approveThis", { what })}>{t("approve")}</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => decideCapexAction(id, "reject", note), t("rejectedMsg"))} aria-label={t("rejectThis", { what })}>{t("reject")}</Button></div>
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </div>
  );
  if (status !== "approved" && status !== "in_progress") return null;
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => updateCapexAction(id, { status: fd.get("status"), spentEgp: fd.get("spentEgp") }), t("progressSaved")); }}>
      <div><label htmlFor={`${fid}-sp`} className="mb-1 block text-xs font-semibold">{t("spentSoFar")}</label><input id={`${fid}-sp`} name="spentEgp" type="number" dir="ltr" min={spent} defaultValue={spent} className="min-h-10 w-36 rounded-md border border-line bg-bg px-2 text-sm" /></div>
      <div><label htmlFor={`${fid}-st`} className="mb-1 block text-xs font-semibold">{t("stage")}</label><select id={`${fid}-st`} name="status" defaultValue="in_progress" className="min-h-10 rounded-md border border-line bg-bg px-2 text-sm"><option value="in_progress">{t("cs_in_progress")}</option><option value="done">{t("cs_done")}</option></select></div>
      <Button type="submit" size="sm" variant="outline" disabled={pending} aria-label={t("saveProgressFor", { what })}>{t("saveProgress")}</Button>
      {msg && <Done text={msg} />}{err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </form>
  );
}
