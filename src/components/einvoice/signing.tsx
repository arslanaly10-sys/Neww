"use client";
import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { CheckCircle2, Download, FileSignature, ShieldCheck, XCircle } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { approveEInvoiceAction, signEInvoiceAction, verifyEInvoiceAction, voidEInvoiceAction } from "@/app/einvoice-actions";
import { cn } from "@/lib/cn";
import { Button, buttonStyles } from "../ui";

export interface SignState { id: string; status: string; approvedBy: string; approverName: string; signerName: string | null; approvedAt: string; signedAt: string | null; keyId: string | null; hash: string }

const STEPS = ["approved", "signed", "submitted"] as const;

/**
 * Approve, then sign (a different manager), then re-check. Each step is a row on a short track that fills as the draft
 * moves; submission stays blocked and says why.
 */
export function Signing({ invoiceId, me, state, hasErrors, blockers, when }: { invoiceId: string; me: string; state: SignState | null; hasErrors: boolean; blockers: string[]; when: { approved: string | null; signed: string | null } }) {
  const t = useTranslations("einv");
  const router = useRouter();
  const fid = useId();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [check, setCheck] = useState<{ valid: boolean; hashMatches: boolean } | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); if (!r.ok) { setErr(t(`se_${r.error}`)); return; } setErr(null); setMsg(ok); setCheck(null); router.refresh(); });
  const reached = state?.status === "signed" ? 2 : state?.status === "approved" ? 1 : 0;

  return (
    <div className="space-y-4">
      <ol className="space-y-0" aria-label={t("track")}>
        {STEPS.map((s, i) => {
          const done = i < reached;
          const blocked = s === "submitted";
          return (
            <li key={s} className="relative flex gap-3 pb-5 last:pb-0">
              {i < STEPS.length - 1 && <span aria-hidden="true" className="absolute start-[0.6875rem] top-6 h-[calc(100%-1.25rem)] w-0.5 overflow-hidden bg-line"><motion.span className="block h-full w-full origin-top bg-gold-fill" initial={false} animate={{ scaleY: done ? 1 : 0 }} transition={{ type: "spring", bounce: 0, visualDuration: 0.5 }} /></span>}
              <motion.span aria-hidden="true" initial={false} animate={{ scale: done ? 1 : 0.85 }} className={cn("relative z-10 grid size-6 shrink-0 place-items-center rounded-full border-2", done ? "border-gold-fill bg-gold-fill text-on-gold" : blocked ? "border-danger/60 bg-surface text-danger" : "border-line bg-surface")}>{done ? <CheckCircle2 size={14} /> : blocked ? <XCircle size={14} /> : null}</motion.span>
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{t(`step_${s}`)}<span className="sr-only">: {done ? t("stepDone") : blocked ? t("stepBlocked") : t("stepWaiting")}</span></p>
                {s === "approved" && state && <p className="text-muted">{t("approvedBy", { who: state.approverName, when: when.approved ?? "" })}</p>}
                {s === "signed" && state?.signerName && <p className="text-muted">{t("signedBy", { who: state.signerName, when: when.signed ?? "", key: state.keyId ?? "" })}</p>}
                {s === "submitted" && <ul className="mt-1 list-disc space-y-0.5 ps-5 text-muted">{blockers.map((b) => <li key={b}>{t(`blk_${b}`)}</li>)}</ul>}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {!state && <Button variant="gold" size="sm" disabled={pending || hasErrors} onClick={() => run(() => approveEInvoiceAction(invoiceId), t("approvedMsg"))}><CheckCircle2 aria-hidden="true" size={14} />{t("approve")}</Button>}
        {!state && hasErrors && <p className="text-xs text-danger">{t("fixErrors")}</p>}
        {state?.status === "approved" && (state.approvedBy === me ? <p className="text-sm text-muted">{t("waitSigner")}</p> : <Button variant="gold" size="sm" disabled={pending} onClick={() => run(() => signEInvoiceAction(state.id), t("signedMsg"))}><FileSignature aria-hidden="true" size={14} />{t("sign")}</Button>)}
        {state?.status === "signed" && (
          <>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => { const r = await verifyEInvoiceAction(state.id); if (!r.ok) { setErr(t(`se_${r.error}`)); return; } setErr(null); setCheck({ valid: r.valid, hashMatches: r.hashMatches }); })}><ShieldCheck aria-hidden="true" size={14} />{t("verify")}</Button>
            <a href={`/api/einvoice/${invoiceId}?signed=1`} download className={buttonStyles({ variant: "outline", size: "sm" })}><Download aria-hidden="true" size={14} />{t("downloadSigned")}</a>
          </>
        )}
        {state && !voiding && <Button variant="ghost" size="sm" disabled={pending} onClick={() => setVoiding(true)}>{t("void")}</Button>}
      </div>
      {voiding && state && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => voidEInvoiceAction(state.id, reason), t("voidedMsg")); setVoiding(false); setReason(""); }}>
          <div className="min-w-60 flex-1"><label htmlFor={`${fid}-r`} className="mb-1 block text-xs font-semibold">{t("voidReason")}</label><input id={`${fid}-r`} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} maxLength={300} className="min-h-10 w-full rounded-md border border-line bg-bg px-2 text-sm" /></div>
          <Button type="submit" size="sm" variant="outline" className="border-danger text-danger" disabled={pending}>{t("void")}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setVoiding(false)}>{t("cancel")}</Button>
        </form>
      )}
      {check && <p role="status" className={cn("flex items-center gap-1.5 text-sm", check.valid && check.hashMatches ? "text-ok" : "text-danger")}>{check.valid && check.hashMatches ? <CheckCircle2 aria-hidden="true" size={16} /> : <XCircle aria-hidden="true" size={16} />}{check.valid && check.hashMatches ? t("verifyOk") : t("verifyBad")}</p>}
      {msg && !check && <p role="status" className="text-sm text-ok">{msg}</p>}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      {state && <p className="text-xs text-muted"><span>{t("hashIs")} </span><code dir="ltr" className="break-all">{state.hash}</code></p>}
    </div>
  );
}
