"use client";
import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, CheckCircle2, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { decideValuationAction } from "@/app/valuation-actions";
import { decideApprovalAction } from "@/app/stage5-actions";
import { Button } from "./ui";

export interface DecisionFact { label: string; value: string; strong?: boolean }

/**
 * Approve or reject, as a deliberate step. The buttons open a sheet that restates what is being decided and what will
 * happen, takes an optional note (a reason is required to reject), and only then decides. Afterwards a clear message
 * names the outcome and the audit event that recorded it. Used for the valuation queue and the approvals queue alike.
 */
export function DecisionControl({ kind, id, title, facts, reason, effect, blockedReason }: {
  kind: "valuation" | "approval"; id: string; title: string; facts: DecisionFact[]; reason?: string | null;
  /** What approving will do, in one sentence (for example: updates the asset value and the portfolio). */
  effect: string; blockedReason: string | null;
}) {
  const t = useTranslations("decide");
  const router = useRouter();
  const [open, setOpen] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const uid = useId();

  const go = (d: "approve" | "reject") => start(async () => {
    setErr(null);
    if (d === "reject" && !note.trim()) { setErr(t("reasonRequired")); return; }
    const r = kind === "valuation" ? await decideValuationAction(id, d, note) : await decideApprovalAction(id, d, note);
    if (!r.ok) { setErr(t(`err_${r.error}` as "err_forbidden")); return; }
    const status = r.status;
    setDone(d === "reject" ? t("doneRejected", { id, seq: r.auditSeq })
      : status === "confirmed" || status === "approved" ? t("doneConfirmed", { id, seq: r.auditSeq })
      : t("donePartial", { id, seq: r.auditSeq }));
    setOpen(null); setNote("");
    router.refresh();
  });

  if (done) return <p role="status" className="flex max-w-xs items-start gap-2 rounded-md border border-ok/40 bg-ok/10 p-3 text-sm text-text"><CheckCircle2 aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-ok" />{done}</p>;
  const disabled = Boolean(blockedReason) || pending;
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex gap-2">
        <Button size="sm" variant="gold" disabled={disabled} aria-describedby={blockedReason ? `${uid}-b` : undefined} onClick={() => setOpen("approve")}><Check aria-hidden="true" size={14} />{t("approve")}</Button>
        <Button size="sm" disabled={disabled} aria-describedby={blockedReason ? `${uid}-b` : undefined} onClick={() => setOpen("reject")}><X aria-hidden="true" size={14} />{t("reject")}</Button>
      </div>
      {blockedReason && <p id={`${uid}-b`} className="max-w-xs text-xs text-muted">{blockedReason}</p>}

      <Dialog.Root open={open !== null} onOpenChange={(o) => { if (!o) { setOpen(null); setErr(null); } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
          <Dialog.Content aria-describedby={`${uid}-d`} className="fixed inset-x-2 bottom-2 z-[61] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-md sm:inset-x-auto sm:start-1/2 sm:top-[10vh] sm:bottom-auto sm:w-[30rem] sm:-translate-x-1/2 sm:rtl:translate-x-1/2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="font-display text-xl">{open === "reject" ? t("rejectTitle", { title }) : t("approveTitle", { title })}</Dialog.Title>
                <Dialog.Description id={`${uid}-d`} className="mt-1 text-sm text-muted">{open === "reject" ? t("rejectEffect") : effect}</Dialog.Description>
              </div>
              <Dialog.Close className="grid size-10 shrink-0 place-items-center rounded-md hover:bg-surface-2" aria-label={t("close")}><X aria-hidden="true" size={16} /></Dialog.Close>
            </div>
            <dl className="mt-4 divide-y divide-line rounded-md border border-line text-sm">
              {facts.map((f) => (
                <div key={f.label} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-3 py-2">
                  <dt className="text-muted">{f.label}</dt><dd className={f.strong ? "font-semibold" : undefined}><bdi>{f.value}</bdi></dd>
                </div>
              ))}
            </dl>
            {reason && <p className="mt-3 rounded-md bg-surface-2 p-3 text-sm"><span className="font-semibold">{t("proposerReason")}</span> {reason}</p>}
            <label htmlFor={`${uid}-n`} className="mt-4 block text-sm font-semibold">{open === "reject" ? t("noteReject") : t("noteApprove")}</label>
            <textarea id={`${uid}-n`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={Boolean(err && open === "reject" && !note.trim())}
              className="mt-1 w-full resize-none rounded-md border border-line bg-bg px-3 py-2 text-sm" />
            {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant={open === "reject" ? "outline" : "gold"} disabled={pending} onClick={() => open && go(open)}>{open === "reject" ? t("confirmReject") : t("confirmApprove")}</Button>
              <Dialog.Close asChild><Button variant="ghost" disabled={pending}>{t("cancel")}</Button></Dialog.Close>
            </div>
            <p className="mt-3 text-xs text-muted">{t("audited")}</p>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
