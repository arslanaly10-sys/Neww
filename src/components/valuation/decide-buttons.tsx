"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { decideValuationAction } from "@/app/valuation-actions";
import { Button } from "../ui";

/** Approve or reject. When the current user may not decide, the buttons stay visible, disabled, with the reason shown. */
export function DecideButtons({ id, blockedReason }: { id: string; blockedReason: string | null }) {
  const t = useTranslations("val");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const go = (d: "approve" | "reject") => start(async () => {
    const r = await decideValuationAction(id, d);
    if (!r.ok) { setMsg(t(`err_${r.error}` as "err_invalid")); return; }
    setMsg(r.status === "confirmed" ? t("confirmedMsg") : r.status === "rejected" ? t("rejectedMsg") : t("approvedPartial", { n: r.approvals, m: r.required }));
    router.refresh();
  });
  const disabled = !!blockedReason || pending;
  const rid = `blocked-${id}`;
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex gap-2">
        <Button size="sm" variant="gold" disabled={disabled} aria-describedby={blockedReason ? rid : undefined} onClick={() => go("approve")}><Check aria-hidden="true" size={14} />{t("approve")}</Button>
        <Button size="sm" disabled={disabled} aria-describedby={blockedReason ? rid : undefined} onClick={() => go("reject")}><X aria-hidden="true" size={14} />{t("reject")}</Button>
      </div>
      {blockedReason && <p id={rid} className="text-xs text-muted">{blockedReason}</p>}
      {msg && <p role="status" className="text-xs text-gold">{msg}</p>}
    </div>
  );
}
