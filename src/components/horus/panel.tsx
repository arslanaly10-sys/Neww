"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Send, X } from "lucide-react";
import { askHorusAction, saveDraftAction } from "@/app/horus-actions";
import type { HorusAnswer } from "@/lib/horus/types";
import { SUGGESTED_KEYS } from "@/lib/horus/suggested";
import { HorusGlyph } from "../brand";
import { Badge, Button } from "../ui";
import { CitationChip } from "./citation-chip";
import { useHorus } from "./provider";
import { Sheen } from "../brand-fx";

interface Turn { id: number; q: string; a?: HorusAnswer; saved?: string | null; saveError?: boolean }

export function HorusButton({ className }: { className?: string }) {
  const t = useTranslations("horus");
  const { setOpen } = useHorus();
  return (
    <button type="button" onClick={() => setOpen(true)} className={`inline-flex min-h-11 items-center gap-2 md:min-h-9 rounded-md border border-line px-3 text-[13px] font-semibold text-text hover:bg-surface-2 ${className ?? ""}`} aria-haspopup="dialog">
      <HorusGlyph size={16} /><Sheen>{t("open")}</Sheen>
    </button>
  );
}

export function HorusPanel({ role }: { role: string }) {
  const t = useTranslations("horus");
  const locale = useLocale();
  const rtl = locale === "ar";
  const { open, setOpen, pending, consume } = useHorus();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const counter = useRef(0);

  const send = useCallback((q: string) => {
    const question = q.trim();
    if (!question) return;
    const id = ++counter.current;
    setTurns((p) => [...p, { id, q: question }]);
    setText("");
    start(async () => {
      try {
        const a = await askHorusAction(question, locale);
        setTurns((p) => p.map((x) => (x.id === id ? { ...x, a } : x)));
      } catch {
        setTurns((p) => p.map((x) => (x.id === id ? { ...x, a: { question, mode: "scripted", notice: "error", blocks: [], cannotVerify: true, dropped: 0, draft: null, advice: false } } : x)));
      }
    });
  }, [locale]);

  // A question handed over from the command bar is sent once the panel is open.
  useEffect(() => { if (open && pending) { send(pending); consume(); } }, [open, pending, send, consume]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [turns, busy]);

  const save = (turnId: number, a: HorusAnswer) => start(async () => {
    const r = await saveDraftAction(a.draft!, locale);
    setTurns((p) => p.map((x) => (x.id === turnId ? { ...x, saved: r.ok ? r.id : null, saveError: !r.ok } : x)));
  });
  const suggestions = SUGGESTED_KEYS.filter((k) => k !== "draft" || role === "manager");

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
          className="fixed inset-y-0 end-0 z-50 flex w-full max-w-[28rem] flex-col border-s border-line bg-bg shadow-2xl sm:w-[28rem]"
          initial={{ x: rtl ? "-100%" : "100%" }} animate={{ x: 0 }} exit={{ x: rtl ? "-100%" : "100%" }}
          transition={{ type: "spring", bounce: 0, visualDuration: 0.32 }}
        >
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <Dialog.Title className="flex items-center gap-2 font-display text-2xl"><HorusGlyph size={22} />{t("title")}</Dialog.Title>
              <p id="horus-sub" className="text-xs text-muted">{t("subtitle")}</p>
              <p className="mt-0.5 text-xs font-semibold text-gold">{t("tagline")}</p>
            </div>
            <Dialog.Close className="grid size-10 shrink-0 place-items-center rounded-md hover:bg-surface-2" aria-label={t("close")}><X aria-hidden="true" size={18} /></Dialog.Close>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4" role="log" aria-live="polite" aria-label={t("history")}>
            {turns.length === 0 && (
              <div>
                <p className="text-sm text-muted">{t("welcome")}</p>
                <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">{t("suggested")}</p>
                <ul className="flex flex-col gap-2">
                  {suggestions.map((k) => (
                    <li key={k}><button type="button" onClick={() => send(t(`q_${k}` as "q_value"))} className="min-h-11 w-full rounded-md border border-line bg-surface md:min-h-10 px-3 py-2 text-start text-sm hover:border-gold">{t(`q_${k}` as "q_value")}</button></li>
                  ))}
                </ul>
              </div>
            )}
            {turns.map((turn) => (
              <article key={turn.id} className="space-y-2">
                <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm"><span className="sr-only">{t("you")}: </span>{turn.q}</p>
                {!turn.a ? <p className="px-1 text-sm text-muted" role="status"><span className="skeleton mb-1 block h-3 w-3/4" /><span className="skeleton block h-3 w-1/2" /><span className="sr-only">{t("asking")}</span></p> : <Answer turn={turn} onSave={() => save(turn.id, turn.a!)} busy={busy} />}
              </article>
            ))}
            <div ref={end} />
          </div>

          <form className="flex items-end gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <label htmlFor="horus-q" className="sr-only">{t("placeholder")}</label>
            <textarea id="horus-q" rows={2} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("placeholder")}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
              className="min-h-12 flex-1 resize-none rounded-md border border-line bg-surface px-3 py-2 text-sm" />
            <Button type="submit" variant="gold" size="icon" disabled={busy || !text.trim()} aria-label={t("ask")}><Send aria-hidden="true" size={16} className="rtl:-scale-x-100" /></Button>
          </form>
        </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
      )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function Answer({ turn, onSave, busy }: { turn: Turn; onSave: () => void; busy: boolean }) {
  const t = useTranslations("horus");
  const a = turn.a!;
  const noticeText = a.notice ? t(`notice_${a.notice}` as "notice_no_key") : null;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={a.mode === "live" ? "ok" : "gold"} className="normal-case">{noticeText ?? (a.mode === "live" ? t("modeLive") : t("modeScripted"))}</Badge>
      </div>
      {a.advice && <p className="rounded-md border border-line bg-surface p-3">{t("advice")}</p>}
      {a.cannotVerify && !a.advice && (
        <div className="rounded-md border border-dashed border-line p-3"><p className="font-semibold">{t("cannotVerify")}</p><p className="mt-1 text-xs text-muted">{t("cannotVerifyHelp")}</p></div>
      )}
      {a.blocks.map((b, i) => (
        <div key={i} className="rounded-md border border-line bg-surface p-3">
          <p>{b.text}</p>
          <p className="mt-2 flex flex-wrap gap-1.5" aria-label={t("citations")}>{b.cites.map((c) => <CitationChip key={c} id={c} />)}</p>
        </div>
      ))}
      {a.draft && (
        <div className="rounded-md border border-gold/50 bg-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">{t("draft")}</p>
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
