"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, MessageCircle, Send, X } from "lucide-react";
import { askPublicAction, submitLeadAction } from "@/app/public-actions";
import type { HorusAnswer } from "@/lib/horus/types";
import { Badge, Button } from "./ui";

interface Turn { id: number; q: string; a?: HorusAnswer }
const SUGGESTED = ["pub_q_what", "pub_q_roles", "pub_q_security", "pub_q_access"] as const;
const field = "min-h-11 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm";

/**
 * The visitor chatbot on the sign-in page. It answers questions about the product from the public help articles only
 * (no portfolio data, no session) and takes demo requests, which go to the team through the simulated outbox.
 */
export function PublicChat() {
  const t = useTranslations("pub");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "lead" | "sent">("chat");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [leadErr, setLeadErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const counter = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns]);

  const send = (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const id = ++counter.current;
    setTurns((p) => [...p, { id, q: question }]); setText("");
    start(async () => {
      let a: HorusAnswer;
      try { a = await askPublicAction(question, locale); } catch { a = { question, mode: "scripted", notice: "error", blocks: [], cannotVerify: true, dropped: 0, draft: null, advice: false }; }
      setTurns((p) => p.map((x) => (x.id === id ? { ...x, a } : x)));
    });
  };
  const submit = (fd: FormData) => start(async () => {
    setErrors([]); setLeadErr(null);
    const r = await submitLeadAction(Object.fromEntries(fd.entries()), locale);
    if (r.ok) setView("sent");
    else if (r.error === "rate_limit") setLeadErr(t("leadRate"));
    else setErrors(r.fields ?? []);
  });
  const err = (f: string) => (errors.includes(f) ? t(`err_${f}` as "err_name") : null);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
      {!open && (
        <Dialog.Trigger className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] end-4 z-30 inline-flex min-h-12 items-center gap-2 rounded-full bg-gold-fill px-4 text-sm font-semibold text-on-gold shadow-md ring-1 ring-black/10 hover:brightness-105 active:brightness-95 md:end-6">
          <MessageCircle aria-hidden="true" size={18} />{t("bubble")}
        </Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Content onInteractOutside={(e) => e.preventDefault()} aria-describedby="pub-sub"
          className="fixed inset-x-2 bottom-2 z-50 flex max-h-[min(36rem,calc(100dvh-1rem))] flex-col rounded-xl border border-line bg-bg shadow-md sm:inset-x-auto sm:end-6 sm:bottom-6 sm:w-[24rem]">
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <Dialog.Title className="font-display text-xl">{t("title")}</Dialog.Title>
              <p id="pub-sub" className="text-xs text-muted">{t("subtitle")}</p>
            </div>
            <Dialog.Close className="grid size-10 shrink-0 place-items-center rounded-md hover:bg-surface-2" aria-label={t("close")}><X aria-hidden="true" size={18} /></Dialog.Close>
          </header>

          {view === "chat" && (
            <>
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" role="log" aria-live="polite" aria-label={t("conversation")} tabIndex={0}>
                {turns.length === 0 && (
                  <div>
                    <p className="text-sm text-muted">{t("welcome")}</p>
                    <ul className="mt-3 flex flex-col gap-2">
                      {SUGGESTED.map((k) => <li key={k}><button type="button" onClick={() => send(t(k))} className="min-h-11 w-full rounded-md border border-line bg-surface px-3 py-2 text-start text-sm hover:border-gold">{t(k)}</button></li>)}
                    </ul>
                  </div>
                )}
                {turns.map((turn) => (
                  <article key={turn.id} className="space-y-2 text-sm">
                    <p className="rounded-lg bg-surface-2 px-3 py-2"><span className="sr-only">{t("you")}: </span>{turn.q}</p>
                    {!turn.a ? <p role="status" className="px-1 text-muted">{t("thinking")}</p> : (
                      <div className="space-y-2">
                        {turn.a.notice === "rate_limit" && <Badge tone="gold">{t("rate")}</Badge>}
                        {turn.a.blocks.map((b, i) => <p key={i} className="rounded-md border border-line bg-surface p-3">{b.text}</p>)}
                        {turn.a.cannotVerify && <p className="rounded-md border border-dashed border-line p-3">{t("noMatch")}</p>}
                      </div>
                    )}
                  </article>
                ))}
                <div ref={end} />
              </div>
              <div className="border-t border-line p-3">
                <Button type="button" variant="outline" size="sm" className="mb-2 w-full" onClick={() => setView("lead")}>{t("requestDemo")}</Button>
                <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
                  <label htmlFor="pub-q" className="sr-only">{t("placeholder")}</label>
                  <input id="pub-q" value={text} maxLength={400} onChange={(e) => setText(e.target.value)} placeholder={t("placeholder")} className={field} />
                  <Button type="submit" variant="gold" size="icon" disabled={busy || !text.trim()} aria-label={t("send")}><Send aria-hidden="true" size={16} className="rtl:-scale-x-100" /></Button>
                </form>
              </div>
            </>
          )}

          {view === "lead" && (
            <form action={submit} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" noValidate>
              <p className="text-sm text-muted">{t("leadIntro")}</p>
              {(["name", "email", "company"] as const).map((f) => (
                <div key={f}>
                  <label htmlFor={`lead-${f}`} className="mb-1 block text-sm font-semibold">{t(`f_${f}`)}{f !== "company" && <span aria-hidden="true" className="text-danger"> *</span>}</label>
                  <input id={`lead-${f}`} name={f} type={f === "email" ? "email" : "text"} required={f !== "company"} autoComplete={f === "name" ? "name" : f === "email" ? "email" : "organization"}
                    aria-invalid={Boolean(err(f))} aria-describedby={err(f) ? `lead-${f}-err` : undefined} className={field} />
                  {err(f) && <p id={`lead-${f}-err`} className="mt-1 text-xs text-danger">{err(f)}</p>}
                </div>
              ))}
              <div>
                <label htmlFor="lead-message" className="mb-1 block text-sm font-semibold">{t("f_message")}</label>
                <textarea id="lead-message" name="message" rows={3} maxLength={1000} className={`${field} resize-none`} />
              </div>
              <div aria-hidden="true" className="absolute -start-[9999px]"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
              <p className="text-xs text-muted">{t("leadPrivacy")}</p>
              {leadErr && <p role="alert" className="text-sm text-danger">{leadErr}</p>}
              <div className="flex gap-2">
                <Button type="submit" variant="gold" size="sm" disabled={busy}>{t("leadSend")}</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setView("chat")}>{t("back")}</Button>
              </div>
            </form>
          )}

          {view === "sent" && (
            <div className="flex-1 px-4 py-6 text-sm" role="status">
              <p className="flex items-center gap-2 font-semibold text-ok"><CheckCircle2 aria-hidden="true" size={18} />{t("sentTitle")}</p>
              <p className="mt-2 text-muted">{t("sentBody")}</p>
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setView("chat")}>{t("back")}</Button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
