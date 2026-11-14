"use client";
import { useId, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { motion, useInView } from "motion/react";
import { CheckCircle2, RefreshCw, Upload } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { importFileAction, importNowAction } from "@/app/market-actions";
import { Button } from "../ui";

/** A small line of a series that draws itself when seen. Decorative: the values are written beside it. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  if (values.length < 2) return null;
  const W = 120, H = 36, min = Math.min(...values), max = Math.max(...values);
  const d = values.map((v, i) => `${i ? "L" : "M"} ${((i / (values.length - 1)) * W).toFixed(1)} ${(H - 3 - ((v - min) / (max - min || 1)) * (H - 6)).toFixed(1)}`).join(" ");
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className={className} direction="ltr">
      <motion.path d={d} fill="none" className="stroke-gold-fill" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: seen ? 1 : 0 }} transition={{ duration: 1.1, ease: "easeInOut" }} />
    </svg>
  );
}

/** Fetch a fresh copy of an API source now (administrator). */
export function ImportNow({ sourceId, name }: { sourceId: string; name: string }) {
  const t = useTranslations("md");
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={pending} aria-label={t("importNowFor", { name })} onClick={() => start(async () => { setMsg(null); const r = await importNowAction(sourceId); setMsg(r.ok ? { ok: true, text: t("imported", { n: r.rows }) } : { ok: false, text: t("importFailed", { error: r.error }) }); router.refresh(); })}>
        <RefreshCw aria-hidden="true" size={14} className={pending ? "animate-spin" : ""} />{pending ? t("importing") : t("importNow")}
      </Button>
      {msg && <span role="status" className={msg.ok ? "flex items-center gap-1 text-xs text-ok" : "text-xs text-danger"}>{msg.ok && <CheckCircle2 aria-hidden="true" size={13} />}{msg.text}</span>}
    </span>
  );
}

/** Import a published file (CAPMAS, CBE) by pasting its figures as "period,value" lines. */
export function FileImport({ sourceId, name }: { sourceId: "capmas_cpi" | "cbe_fx"; name: string }) {
  const t = useTranslations("md");
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={t("fileImportFor", { name })}><Upload aria-hidden="true" size={14} />{t("fileImport")}</Button>;
  return (
    <form className="w-full space-y-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { const r = await importFileAction({ sourceId, published: fd.get("published"), text: fd.get("text") }); setMsg(r.ok ? { ok: true, text: t("imported", { n: r.rows }) } : { ok: false, text: "line" in r && r.line ? t("badLine", { line: String(r.line) }) : t("fileInvalid") }); if (r.ok) router.refresh(); }); }}>
      <label htmlFor={`${id}-p`} className="block text-sm font-semibold">{t("publishedOn")}</label>
      <input id={`${id}-p`} name="published" type="date" required dir="ltr" className="min-h-11 rounded-md border border-line bg-bg px-3 text-sm" />
      <label htmlFor={`${id}-t`} className="block text-sm font-semibold">{t("fileRows")}</label>
      <textarea id={`${id}-t`} name="text" required rows={4} dir="ltr" placeholder={sourceId === "capmas_cpi" ? "2026-08,281.4\n2026-09,284.3" : "2026-11-10,47.85\n2026-11-11,47.90"} className="w-full rounded-md border border-line bg-bg px-3 py-2 font-mono text-sm" />
      <p className="text-xs text-muted">{t("fileHelp")}</p>
      <div className="flex flex-wrap items-center gap-2"><Button type="submit" size="sm" variant="gold" disabled={pending}>{t("importRows")}</Button><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>{msg && <span role="status" className={msg.ok ? "text-xs text-ok" : "text-xs text-danger"}>{msg.text}</span>}</div>
    </form>
  );
}
