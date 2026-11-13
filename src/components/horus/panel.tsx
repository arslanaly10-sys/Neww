"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, CheckCircle2, History, LifeBuoy, Loader2, Mail, Paperclip, Plus, Send, Trash2, X } from "lucide-react";
import { confirmHorusActionAction, deleteThreadAction, getThreadAction, listThreadsAction, saveDraftAction, uploadHorusFileAction } from "@/app/horus-actions";
import type { HorusAction, HorusAnswer, HorusMode } from "@/lib/horus/types";
import { SUGGESTED_KEYS } from "@/lib/horus/suggested";
import { useRouter, Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { HorusGlyph } from "../brand";
import { Badge, Button } from "../ui";
import { CitationChip } from "./citation-chip";
import { useHorus } from "./provider";
import { Sheen } from "../brand-fx";

interface Turn { id: string; q: string; a?: HorusAnswer; steps: string[]; fresh?: boolean; saved?: string | null; saveError?: boolean; done?: Record<number, string> }
interface Attached { id: string; name: string; pages: number }
interface ThreadRow { id: string; mode: HorusMode; title: string; updatedAt: string }
const HELP_SUGGESTED = ["help_q_approve", "help_q_roles", "help_q_numbers", "help_q_pack"] as const;

export function HorusButton({ className }: { className?: string }) {
  const t = useTranslations("horus");
  const { setOpen } = useHorus();
  return (
    <button type="button" onClick={() => setOpen(true)} className={cn("inline-flex min-h-11 items-center gap-2 md:min-h-9 rounded-md border border-line px-3 text-[13px] font-semibold text-text hover:bg-surface-2 active:bg-line/60", className)} aria-haspopup="dialog">
      <HorusGlyph size={16} /><Sheen>{t("open")}</Sheen>
    </button>
  );
}

/** A round button that stays in the bottom corner of every page and opens Horus (or help, for the administrator). */
export function HorusBubble({ helpOnly }: { helpOnly: boolean }) {
  const t = useTranslations("horus");
  const { open, setOpen, openMode } = useHorus();
  if (open) return null;
  return (
    <button type="button" aria-haspopup="dialog" aria-label={helpOnly ? t("bubbleHelp") : t("open")} onClick={() => (helpOnly ? openMode("help") : setOpen(true))}
      className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] end-4 z-30 grid size-14 place-items-center rounded-full bg-gold-fill text-on-gold shadow-md ring-1 ring-black/10 transition-transform hover:scale-105 active:scale-95 md:bottom-6 md:end-6">
      {helpOnly ? <LifeBuoy aria-hidden="true" size={22} /> : <HorusGlyph size={24} />}
    </button>
  );
}

/** Reveals an answer's text progressively once it has been verified. Shows it at once for reduced motion. */
function Typed({ text, animate }: { text: string; animate: boolean }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(animate && !reduce ? 0 : text.length);
  useEffect(() => {
    if (!animate || reduce) return;
    const step = Math.max(2, Math.round(text.length / 60));
    const id = window.setInterval(() => setN((x) => { if (x + step >= text.length) { window.clearInterval(id); return text.length; } return x + step; }), 16);
    return () => window.clearInterval(id);
  }, [text, animate, reduce]);
  return <p>{text.slice(0, n)}{n < text.length && <span aria-hidden="true" className="ms-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-gold-fill align-middle" />}</p>;
}

export function HorusPanel({ role }: { role: string }) {
  const t = useTranslations("horus");
  const locale = useLocale();
  const rtl = locale === "ar";
  const router = useRouter();
  const canPortfolio = role !== "admin";
  const { open, setOpen, pending, requestedMode, consume } = useHorus();
  const [mode, setMode] = useState<HorusMode>(canPortfolio ? "portfolio" : "help");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [files, setFiles] = useState<Attached[]>([]);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [working, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const counter = useRef(0);

  const newChat = useCallback((m?: HorusMode) => { setTurns([]); setThreadId(null); setFiles([]); setView("chat"); setShowAll(false); if (m) setMode(m); }, []);

  const send = useCallback(async (q: string, m: HorusMode = mode) => {
    const question = q.trim();
    if (!question || busy) return;
    const id = `local-${++counter.current}`;
    setTurns((p) => [...p, { id, q: question, steps: [] }]);
    setText(""); setBusy(true); setView("chat");
    const patch = (fn: (x: Turn) => Turn) => setTurns((p) => p.map((x) => (x.id === id ? fn(x) : x)));
    try {
      const res = await fetch("/api/horus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, locale, mode: m, threadId, fileIds: m === "portfolio" ? files.map((f) => f.id) : [] }) });
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { type: "step"; tool: string } | { type: "answer"; answer: HorusAnswer; threadId: string | null };
          if (ev.type === "step") patch((x) => ({ ...x, steps: [...x.steps, ev.tool] }));
          else { patch((x) => ({ ...x, a: ev.answer, fresh: true })); if (ev.threadId) setThreadId(ev.threadId); }
        }
      }
    } catch {
      patch((x) => ({ ...x, a: { question, mode: "scripted", notice: "error", blocks: [], cannotVerify: true, dropped: 0, draft: null, advice: false } }));
    } finally { setBusy(false); setThreads(null); }
  }, [busy, files, locale, mode, threadId]);

  // A question or mode handed over from the command bar or the bubble is applied once the panel is open.
  useEffect(() => {
    if (!open || !(pending || requestedMode)) return;
    const id = window.setTimeout(() => {
      if (requestedMode && requestedMode !== mode) newChat(requestedMode);
      if (pending) { const m = pending.mode ?? (canPortfolio ? "portfolio" : "help"); if (m !== mode) newChat(m); void send(pending.q, m); }
      consume();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, pending, requestedMode, consume, send, mode, newChat, canPortfolio]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [turns, busy]);
  useEffect(() => {
    if (view !== "history" || threads) return;
    start(async () => setThreads(await listThreadsAction()));
  }, [view, threads]);

  const openThread = (id: string) => start(async () => {
    const th = await getThreadAction(id);
    if (!th) return;
    setMode(th.mode); setThreadId(th.id); setFiles([]);
    setTurns(th.turns.map((x) => ({ id: x.id, q: x.q, a: x.a, steps: [] })));
    setView("chat");
  });
  const removeThread = (id: string) => start(async () => { await deleteThreadAction(id); setThreads((p) => p?.filter((x) => x.id !== id) ?? null); if (id === threadId) newChat(); });

  const upload = (f: File) => start(async () => {
    setUploadMsg(t("uploading"));
    const fd = new FormData(); fd.set("file", f);
    const r = await uploadHorusFileAction(fd);
    if (r.ok) { setFiles((p) => [...p.filter((x) => x.id !== r.file.id), { id: r.file.id, name: r.file.name, pages: r.file.pages }].slice(-5)); setUploadMsg(t("uploaded", { name: r.file.name })); }
    else setUploadMsg(t(`upload_${r.error}` as "upload_empty"));
  });

  const save = (turnId: string, a: HorusAnswer) => start(async () => {
    const r = await saveDraftAction(a.draft!, locale);
    setTurns((p) => p.map((x) => (x.id === turnId ? { ...x, saved: r.ok ? r.id : null, saveError: !r.ok } : x)));
  });
  const confirm = (turnId: string, i: number, action: HorusAction) => start(async () => {
    const r = await confirmHorusActionAction(action);
    const msg = r.ok ? (r.kind === "draft_email" ? t("act_done_email", { id: r.id ?? "" }) : r.kind === "start_valuation" ? t("act_done_val") : t("act_done_snooze")) : t(`act_err_${r.error}` as "act_err_invalid");
    setTurns((p) => p.map((x) => (x.id === turnId ? { ...x, done: { ...x.done, [i]: msg } } : x)));
    if (r.ok && r.href) { setOpen(false); router.push(r.href); }
    if (r.ok && r.kind === "snooze_alert") router.refresh();
  });

  const portfolioQs = SUGGESTED_KEYS.filter((k) => k !== "draft" || role === "manager");
  const visibleQs = showAll ? portfolioQs : portfolioQs.slice(0, 4);
  const stepLabel = (tool: string) => (t.has(`step_${tool}`) ? t(`step_${tool}` as "step_portfolio_summary") : t("step_other"));

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
      {open && (
      <Dialog.Portal forceMount>
        <Dialog.Overlay forceMount asChild>
          <motion.div className="fixed inset-0 z-40 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
        </Dialog.Overlay>
        <Dialog.Content forceMount asChild aria-describedby="horus-sub">
        <motion.div
          className="fixed inset-y-0 end-0 z-50 flex w-full max-w-[28rem] flex-col border-s border-line bg-bg shadow-md sm:w-[28rem]"
          initial={{ x: rtl ? "-100%" : "100%" }} animate={{ x: 0 }} exit={{ x: rtl ? "-100%" : "100%" }}
          transition={{ type: "spring", bounce: 0, visualDuration: 0.32 }}
        >
          <header className="border-b border-line px-4 pb-2 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="flex items-center gap-2 font-display text-2xl"><HorusGlyph size={22} />{t("title")}</Dialog.Title>
                <p id="horus-sub" className="text-xs text-muted">{mode === "help" ? t("helpSubtitle") : t("subtitle")}</p>
                <p className="mt-0.5 text-xs font-semibold text-gold">{t("tagline")}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => setView(view === "history" ? "chat" : "history")} aria-pressed={view === "history"} aria-label={t("historyOpen")} className="grid size-10 place-items-center rounded-md hover:bg-surface-2 aria-pressed:bg-surface-2"><History aria-hidden="true" size={17} /></button>
                <button type="button" onClick={() => newChat()} aria-label={t("newChat")} className="grid size-10 place-items-center rounded-md hover:bg-surface-2"><Plus aria-hidden="true" size={18} /></button>
                <Dialog.Close className="grid size-10 place-items-center rounded-md hover:bg-surface-2" aria-label={t("close")}><X aria-hidden="true" size={18} /></Dialog.Close>
              </div>
            </div>
            {canPortfolio && (
              <div role="radiogroup" aria-label={t("modeLabel")} className="mt-2 inline-flex rounded-md border border-line p-0.5 text-xs font-semibold">
                {(["portfolio", "help"] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => mode !== m && newChat(m)}
                    className={cn("min-h-9 rounded px-3", mode === m ? "bg-gold-fill text-on-gold" : "text-muted hover:text-text")}>{t(`mode_${m}`)}</button>
                ))}
              </div>
            )}
          </header>

          {view === "history" ? (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <button type="button" onClick={() => setView("chat")} className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-sm text-gold"><ArrowLeft aria-hidden="true" size={15} className="rtl:-scale-x-100" />{t("backToChat")}</button>
              <h3 className="mb-2 text-sm font-semibold">{t("history")}</h3>
              {!threads ? <p role="status" className="text-sm text-muted">{t("loadingHistory")}</p>
                : threads.length === 0 ? <p className="text-sm text-muted">{t("historyEmpty")}</p>
                : (
                  <ul className="divide-y divide-line rounded-md border border-line bg-surface">
                    {threads.map((th) => (
                      <li key={th.id} className="flex items-center gap-2 px-3 py-2">
                        <button type="button" onClick={() => openThread(th.id)} className="min-h-10 min-w-0 flex-1 text-start">
                          <span className="block truncate text-sm">{th.title}</span>
                          <span className="text-xs text-muted">{t(`mode_${th.mode}`)}, {new Date(th.updatedAt).toLocaleString(locale === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" })}</span>
                        </button>
                        <button type="button" onClick={() => removeThread(th.id)} aria-label={t("deleteThread", { title: th.title })} className="grid size-10 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"><Trash2 aria-hidden="true" size={15} /></button>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          ) : (
          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4" role="log" aria-live="polite" aria-label={t("conversation")} tabIndex={0}>
            {turns.length === 0 && (
              <div>
                <p className="text-sm text-muted">{mode === "help" ? t("helpWelcome") : t("welcome")}</p>
                <p className="mb-2 mt-5 text-xs font-semibold text-muted">{t("suggested")}</p>
                <ul className="flex flex-col gap-2">
                  {(mode === "help" ? HELP_SUGGESTED.map((k) => t(k)) : visibleQs.map((k) => t(`q_${k}` as "q_value"))).map((q) => (
                    <li key={q}><button type="button" onClick={() => send(q)} className="min-h-11 w-full rounded-md border border-line bg-surface md:min-h-10 px-3 py-2 text-start text-sm hover:border-gold">{q}</button></li>
                  ))}
                </ul>
                {mode === "portfolio" && portfolioQs.length > 4 && (
                  <button type="button" onClick={() => setShowAll((x) => !x)} aria-expanded={showAll} className="mt-2 min-h-10 text-sm text-gold underline underline-offset-4">{showAll ? t("fewerQs") : t("moreQs", { n: portfolioQs.length - 4 })}</button>
                )}
              </div>
            )}
            {turns.map((turn) => (
              <article key={turn.id} className="space-y-2">
                <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm"><span className="sr-only">{t("you")}: </span>{turn.q}</p>
                {!turn.a ? (
                  <div className="px-1 text-sm text-muted" role="status">
                    <p className="flex items-center gap-2"><Loader2 aria-hidden="true" size={14} className="animate-spin motion-reduce:animate-none" />{turn.steps.length ? stepLabel(turn.steps[turn.steps.length - 1]) : t("asking")}</p>
                    {turn.steps.length > 1 && <ul className="mt-1 space-y-0.5 ps-6 text-xs">{turn.steps.slice(0, -1).map((s, i) => <li key={i} className="flex items-center gap-1.5"><CheckCircle2 aria-hidden="true" size={12} className="text-ok" />{stepLabel(s)}</li>)}</ul>}
                  </div>
                ) : <Answer turn={turn} onSave={() => save(turn.id, turn.a!)} onConfirm={(i, a) => confirm(turn.id, i, a)} onDismiss={(i) => setTurns((p) => p.map((x) => (x.id === turn.id ? { ...x, done: { ...x.done, [i]: t("act_dismissed") } } : x)))} busy={working} onClose={() => setOpen(false)} />}
              </article>
            ))}
            <div ref={end} />
          </div>
          )}

          <form className="border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
            {mode === "portfolio" && (files.length > 0 || uploadMsg) && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {files.map((f) => (
                  <span key={f.id} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-surface-2 ps-2.5 text-xs">
                    <Paperclip aria-hidden="true" size={12} /><bdi className="max-w-[12rem] truncate">{f.name}</bdi>
                    <button type="button" onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))} aria-label={t("removeFile", { name: f.name })} className="grid size-8 place-items-center rounded-full hover:bg-line/60"><X aria-hidden="true" size={12} /></button>
                  </span>
                ))}
                {uploadMsg && <span role="status" className="text-xs text-muted">{uploadMsg}</span>}
              </div>
            )}
            <div className="flex items-end gap-2">
              {mode === "portfolio" && (
                <>
                  <input ref={fileInput} type="file" accept=".pdf,.txt,.md,.csv,application/pdf,text/plain" className="sr-only" tabIndex={-1} aria-hidden="true"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
                  <Button type="button" variant="outline" size="icon" onClick={() => fileInput.current?.click()} disabled={working} aria-label={t("attach")}><Paperclip aria-hidden="true" size={16} /></Button>
                </>
              )}
              <label htmlFor="horus-q" className="sr-only">{mode === "help" ? t("helpPlaceholder") : t("placeholder")}</label>
              <textarea id="horus-q" rows={2} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "help" ? t("helpPlaceholder") : t("placeholder")}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }}
                className="min-h-12 flex-1 resize-none rounded-md border border-line bg-surface px-3 py-2 text-sm" />
              <Button type="submit" variant="gold" size="icon" disabled={busy || !text.trim()} aria-label={t("ask")}><Send aria-hidden="true" size={16} className="rtl:-scale-x-100" /></Button>
            </div>
          </form>
        </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
      )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function ActionCard({ action, done, onConfirm, onDismiss, busy }: { action: HorusAction; done?: string; onConfirm: () => void; onDismiss: () => void; busy: boolean }) {
  const t = useTranslations("horus");
  return (
    <div className="rounded-md border border-gold/50 bg-surface p-3">
      <p className="text-xs font-semibold text-gold">{t("act_title")}</p>
      {action.kind === "snooze_alert" && <><p className="mt-1 font-semibold">{t("act_snooze", { asset: action.label })}</p><p className="mt-1 text-muted">{t("act_reason", { reason: action.reason || "–" })}</p></>}
      {action.kind === "start_valuation" && <p className="mt-1 font-semibold">{t("act_val", { asset: action.label, id: action.assetId })}</p>}
      {action.kind === "draft_email" && (
        <div className="mt-1 space-y-1">
          <p className="flex items-center gap-1.5 font-semibold"><Mail aria-hidden="true" size={14} />{action.subject}</p>
          <p className="text-xs text-muted">{t("act_to", { to: action.to })}</p>
          <p className="whitespace-pre-line text-muted">{action.body}</p>
          <p className="text-xs text-muted">{t("act_emailNote")}</p>
        </div>
      )}
      {done ? <p role="status" className="mt-2 flex gap-2 text-ok"><CheckCircle2 aria-hidden="true" size={16} className="mt-0.5 shrink-0" />{done}</p> : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="gold" disabled={busy} onClick={onConfirm}>{t(action.kind === "draft_email" ? "act_send" : action.kind === "start_valuation" ? "act_open" : "act_confirm")}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onDismiss}>{t("act_dismiss")}</Button>
        </div>
      )}
    </div>
  );
}

function Answer({ turn, onSave, onConfirm, onDismiss, busy, onClose }: { turn: Turn; onSave: () => void; onConfirm: (i: number, a: HorusAction) => void; onDismiss: (i: number) => void; busy: boolean; onClose: () => void }) {
  const t = useTranslations("horus");
  const a = turn.a!;
  const noticeText = a.notice ? t(`notice_${a.notice}` as "notice_no_key") : null;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={a.mode === "live" ? "ok" : "gold"}>{noticeText ?? (a.mode === "live" ? t("modeLive") : t("modeScripted"))}</Badge>
      </div>
      {a.advice && <p className="rounded-md border border-line bg-surface p-3">{t("advice")}</p>}
      {a.cannotVerify && !a.advice && (
        <div className="rounded-md border border-dashed border-line p-3"><p className="font-semibold">{a.help ? t("helpNoMatch") : t("cannotVerify")}</p><p className="mt-1 text-xs text-muted">{a.help ? t("helpNoMatchHelp") : t("cannotVerifyHelp")}</p></div>
      )}
      {a.blocks.map((b, i) => (
        <div key={i} className="rounded-md border border-line bg-surface p-3">
          <Typed text={b.text} animate={Boolean(turn.fresh)} />
          {b.cites.length > 0 && <p className="mt-2 flex flex-wrap gap-1.5" aria-label={t("citations")}>{b.cites.map((c) => <CitationChip key={c} id={c} />)}</p>}
        </div>
      ))}
      {a.help && a.help.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted">{t("helpRelated")}</p>
          <ul className="mt-1 space-y-1">
            {a.help.map((h) => <li key={h.id}>{h.href ? <Link href={h.href} onClick={onClose} className="text-gold underline underline-offset-4">{h.title}</Link> : <span>{h.title}</span>}</li>)}
          </ul>
        </div>
      )}
      {(a.actions ?? []).map((ac, i) => <ActionCard key={i} action={ac} done={turn.done?.[i]} busy={busy} onConfirm={() => onConfirm(i, ac)} onDismiss={() => onDismiss(i)} />)}
      {a.draft && (
        <div className="rounded-md border border-gold/50 bg-surface p-3">
          <p className="text-xs font-semibold text-gold">{t("draft")}</p>
          <p className="mt-1 font-semibold">{a.draft.title}</p>
          <p className="mt-1 whitespace-pre-line text-muted">{a.draft.body}</p>
          <p className="mt-2 flex flex-wrap gap-1.5" aria-label={t("citations")}>{a.draft.cites.map((c) => <CitationChip key={c} id={c} />)}</p>
          <p className="mt-2 text-xs text-muted">{t("draftNote")}</p>
          {turn.saved ? <p role="status" className="mt-2 flex gap-2 text-ok"><CheckCircle2 aria-hidden="true" size={16} className="mt-0.5 shrink-0" />{t("savedDraft", { id: turn.saved })}</p>
            : <Button size="sm" variant="gold" className="mt-2" disabled={busy} onClick={onSave}>{t("saveDraft")}</Button>}
          {turn.saveError && <p role="alert" className="mt-2 text-danger">{t("saveFailed")}</p>}
        </div>
      )}
      {a.dropped > 0 && <p className="text-xs text-muted">{t("droppedNote", { n: a.dropped })}</p>}
    </div>
  );
}
