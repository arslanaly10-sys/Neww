"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck, RotateCcw } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { resetDemoAction, restoreAction, tamperAction, verifyChainAction } from "@/app/stage5-actions";
import type { ChainCheck } from "@/lib/audit-service";
import { cn } from "@/lib/cn";
import { Button, Card } from "../ui";
import { ChainMark } from "../brand-fx";

type Note = { tone: "ok" | "bad" | "info"; text: string; detail?: string };

/** Verify the hash chain, and (demo only) break and repair it so the check can be seen working. */
export function ChainControls({ initial }: { initial: ChainCheck }) {
  const t = useTranslations("gov2");
  const router = useRouter();
  const [check, setCheck] = useState<ChainCheck>(initial);
  const [note, setNote] = useState<Note | null>(null);
  const [pending, start] = useTransition();
  const [phrase, setPhrase] = useState("");

  const describe = (c: ChainCheck): Note => c.ok
    ? { tone: "ok", text: t("verifyPass", { n: c.count, head: c.headHash.slice(0, 12) }) }
    : { tone: "bad", text: c.firstBad!.kind === "hash" ? t("verifyFail", { seq: c.firstBad!.seq, idx: c.firstBad!.index, exp: c.firstBad!.expected.slice(0, 16) + "…", found: c.firstBad!.found.slice(0, 16) + "…" }) : t("verifyFailLink", { seq: c.firstBad!.seq, idx: c.firstBad!.index }), detail: c.firstBad ? `expected ${c.firstBad.expected}\nfound    ${c.firstBad.found}` : undefined };

  const verify = () => start(async () => { setNote(null); const r = await verifyChainAction(); if (r.ok) { setCheck(r.check); setNote(describe(r.check)); } else setNote({ tone: "bad", text: t("err_forbidden") }); });
  const tamper = () => start(async () => {
    const r = await tamperAction();
    if (!r.ok) { setNote({ tone: "info", text: t(`err_${r.error}` as "err_forbidden") }); return; }
    setNote({ tone: "info", text: t("tamperedMsg", { seq: r.seq }) }); router.refresh();
  });
  const restore = () => start(async () => {
    const r = await restoreAction();
    if (!r.ok) { setNote({ tone: "info", text: t(`err_${r.error}` as "err_forbidden") }); return; }
    setNote({ tone: "info", text: t("restoredMsg") }); router.refresh();
  });
  const reset = () => start(async () => {
    const r = await resetDemoAction(phrase);
    if (!r.ok) { setNote({ tone: "bad", text: t("resetWrong") }); return; }
    setNote({ tone: "ok", text: t("resetDone") }); setPhrase(""); router.refresh();
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="gold" onClick={verify} disabled={pending}><ShieldCheck aria-hidden="true" size={16} />{pending ? t("verifying") : t("verify")}</Button>
        <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", check.ok ? "text-ok" : "text-danger")}>
          <ChainMark state={pending ? "running" : check.ok ? "ok" : "bad"} />
          {check.ok ? t("chainOk") : t("chainBad", { seq: check.firstBad!.seq })}
        </span>
      </div>
      <div role="status" aria-live="polite">
        {note && (
          <div className={cn("rounded-md border p-3 text-sm", note.tone === "ok" ? "border-ok/50" : note.tone === "bad" ? "border-danger/60" : "border-line")}>
            <p className={note.tone === "ok" ? "text-ok" : note.tone === "bad" ? "text-danger" : ""}>{note.text}</p>
            {note.detail && <pre dir="ltr" className="mt-2 overflow-x-auto rounded bg-surface-2 p-2 font-mono text-[11px] text-muted">{note.detail}</pre>}
          </div>
        )}
      </div>
      <Card className="border-dashed p-4">
        <p className="mb-3 text-xs text-muted">{t("tamperHelp")}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={tamper} disabled={pending}>{t("tamper")}</Button>
          <Button size="sm" onClick={restore} disabled={pending}><RotateCcw aria-hidden="true" size={14} />{t("restore")}</Button>
        </div>
      </Card>
      <Card className="border-dashed p-4">
        <h3 className="font-semibold">{t("reset")}</h3>
        <p className="mb-3 mt-1 text-xs text-muted">{t("resetHelp")}</p>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); reset(); }}>
          <div><label htmlFor="rs" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{t("resetConfirm")}</label><input id="rs" dir="ltr" autoComplete="off" className="min-h-10 w-40 rounded-md border border-line bg-surface px-3 text-sm" value={phrase} onChange={(e) => setPhrase(e.target.value)} /></div>
          <Button type="submit" size="sm" disabled={pending || phrase !== "RESET"}>{t("resetGo")}</Button>
        </form>
      </Card>
    </div>
  );
}
