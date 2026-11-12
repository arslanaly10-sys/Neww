"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { verifyPackAction } from "@/app/pack-actions";
import { dateFmt } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, Card } from "../ui";

export function VerifyPack() {
  const t = useTranslations("packui");
  const r = useTranslations("roles");
  const locale = useLocale();
  const [hash, setHash] = useState("");
  const [res, setRes] = useState<Awaited<ReturnType<typeof verifyPackAction>> | "invalid" | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <h2 className="font-display text-2xl">{t("verifyTitle")}</h2>
      <p className="mb-4 mt-1 max-w-2xl text-sm text-muted">{t("verifyHelp")}</p>
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => {
        e.preventDefault();
        const h = hash.trim().toLowerCase();
        if (!/^[0-9a-f]{64}$/.test(h)) { setRes("invalid"); return; }
        start(async () => setRes(await verifyPackAction(h)));
      }}>
        <div className="flex-1">
          <label htmlFor="pk-hash" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{t("verifyLabel")}</label>
          <input id="pk-hash" dir="ltr" spellCheck={false} autoComplete="off" className="min-h-11 w-full rounded-md border border-line bg-surface px-3 font-mono text-xs" value={hash} onChange={(e) => setHash(e.target.value)} />
        </div>
        <Button type="submit" variant="gold" disabled={pending}>{pending ? t("working") : t("verify")}</Button>
      </form>
      <div role="status" aria-live="polite" className="mt-4 text-sm">
        {res === "invalid" && <p className="text-danger">{t("invalid")}</p>}
        {res && res !== "invalid" && !res.found && <p className="flex gap-2 text-danger"><ShieldAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0" />{t("notFound")}</p>}
        {res && res !== "invalid" && res.found && (
          <div className={cn("flex gap-2 rounded-md border p-3", res.chainIntact ? "border-ok/50" : "border-danger/50")}>
            {res.chainIntact ? <ShieldCheck aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-ok" /> : <ShieldAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-danger" />}
            <div>
              <p>{t("found", { id: res.id!, lang: res.lang === "ar" ? t("langAr") : t("langEn"), date: dateFmt(res.at!.slice(0, 10), locale), role: r((res.role ?? "manager") as "manager"), seq: res.headSeq! })}</p>
              <p className={res.chainIntact ? "text-ok" : "text-danger"}>{res.chainIntact ? t("chainOk") : t("chainBroken")}</p>
              {res.matched === "content" && <p className="mt-1 text-xs text-muted">{t("matchedContent")}</p>}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
