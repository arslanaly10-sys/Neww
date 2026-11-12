"use client";
import { useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, FileUp } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { confirmExtractionAction, extractSampleAction, identifyUploadAction } from "@/app/docs-actions";
import type { ExtractionView, FieldView } from "@/lib/docs/service";
import { dateFmt, money } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, Button, Card } from "../ui";

const SAMPLE_IDS = ["lease-en", "deed-ar", "lease-bilingual"] as const;
const CLAUSE_CODES: Record<string, string[]> = { "clause.break": ["after12m90d", "none"], "clause.renewal": ["tenantFirstRight", "mutual"], "clause.sublet": ["consentRequired"], "clause.governingLaw": ["egypt"] };
const field = "min-h-10 w-full rounded-md border border-line bg-surface px-2 text-sm";

async function sha256(file: File) {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function Reader() {
  const t = useTranslations("docs");
  const [view, setView] = useState<ExtractionView | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "gold"; text: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const load = (sampleId: string) => start(async () => {
    setMsg(null);
    const r = await extractSampleAction(sampleId);
    if (!r.ok) { setView(null); setMsg({ tone: "danger", text: t(`err_${r.error}` as "err_forbidden") }); return; }
    setView(r.view);
  });
  const onFile = (file: File | undefined) => {
    if (!file) return;
    start(async () => {
      setMsg(null); setView(null);
      const id = await identifyUploadAction(await sha256(file));
      if (!id.ok) { setMsg({ tone: "danger", text: id.error === "not_sample" ? t("refused") : t(`err_${id.error}` as "err_forbidden") }); return; }
      const r = await extractSampleAction(id.sampleId);
      if (!r.ok) { setMsg({ tone: "danger", text: t(`err_${r.error}` as "err_forbidden") }); return; }
      setView(r.view);
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-1 font-display text-xl">{t("dropTitle")}</h2>
        <p className="mb-4 text-sm text-muted">{t("dropHelp")}</p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}
          className={cn("grid min-h-32 place-items-center rounded-lg border-2 border-dashed p-6 text-center transition-colors", drag ? "border-gold bg-surface-2" : "border-line")}
        >
          <div>
            <FileUp aria-hidden="true" className="mx-auto mb-2 text-gold" />
            <p className="text-sm text-muted">{drag ? t("dropHere") : t("dropTitle")}</p>
            <input ref={input} id="doc-file" type="file" accept="application/pdf,.pdf" aria-label={t("choose")} tabIndex={-1} className="sr-only" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            <Button className="mt-3" onClick={() => input.current?.click()} disabled={pending}>{t("choose")}</Button>
          </div>
        </div>
        <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">{t("orSample")}</p>
        <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {SAMPLE_IDS.map((s) => <li key={s}><Button size="sm" onClick={() => load(s)} disabled={pending} className="w-full text-start sm:w-auto">{t(`sample_${s}` as "sample_lease-en")}</Button></li>)}
        </ul>
        {pending && !view && <p role="status" className="mt-4 text-sm text-muted">{t("reading")}</p>}
        {msg && <p role={msg.tone === "danger" ? "alert" : "status"} className={cn("mt-4 rounded-md border p-3 text-sm", msg.tone === "danger" ? "border-danger/50 text-danger" : "border-ok/50 text-ok")}>{msg.text}</p>}
      </Card>
      {view && <Extraction key={view.sample.id + (view.confirmed?.at ?? "")} view={view} reload={() => load(view.sample.id)} />}
    </div>
  );
}

function Extraction({ view, reload }: { view: ExtractionView; reload: () => void }) {
  const t = useTranslations("docs");
  const cl = useTranslations("clause");
  const locale = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);

  const cur = (f: FieldView) => values[f.key] ?? String(f.value);
  const edited = (f: FieldView) => cur(f) !== String(f.value);
  const needs = (f: FieldView) => f.needsCheck || edited(f);
  const missing = view.fields.filter((f) => needs(f) && !checked.has(f.key));
  const fmtRecord = (f: FieldView) => {
    const v = f.recordValue;
    if (v === null) return "–";
    if (f.type === "date") return dateFmt(String(v), locale);
    if (f.type === "money") return money(Number(v), "EGP", locale);
    if (f.type === "clause") return cl(`${f.key.slice(7)}_${v}` as "break_none");
    return String(v);
  };
  const label = (k: string) => t(`f_${k.replace(".", "_")}` as "f_reference");

  const confirm = () => start(async () => {
    setResult(null);
    const vals: Record<string, string | number> = {};
    view.fields.forEach((f) => { if (edited(f)) vals[f.key] = f.type === "date" || f.type === "text" || f.type === "clause" ? cur(f) : Number(cur(f).replace(/,/g, "")); });
    const r = await confirmExtractionAction({ sampleId: view.sample.id, values: vals, checked: [...checked] });
    if (!r.ok) { setResult({ tone: "danger", text: t(`err_${r.error}` as "err_unchecked") }); return; }
    setResult({ tone: "ok", text: r.changes.length ? t("confirmedOk", { n: r.changes.length }) : t("noChange") });
    router.refresh();
    setTimeout(reload, 900);
  });

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">{t("extractTitle", { file: view.sample.file })}</h2>
          <p className="text-sm text-muted">{t("forAsset", { asset: `${view.asset.id} · ${ar ? view.asset.nameAr : view.asset.name}` })} · {t("pages", { n: view.pageCount })} · <Link href={`/asset/${view.asset.id}`} className="text-gold underline underline-offset-4">{t("openAsset")}</Link> · <a href={`/samples/${view.sample.file}`} target="_blank" rel="noreferrer" className="text-gold underline underline-offset-4">{t("openPdf")}</a></p>
          <p className="mt-1 text-xs text-muted">{t("engine", { engine: view.engine })}</p>
        </div>
        <Badge tone="gold">{view.sample.language === "bilingual" ? t("bothLangs") : view.sample.language === "ar" ? t("onlyAr") : t("onlyEn")}</Badge>
      </div>
      {view.confirmed && <p className="mt-3 text-xs text-muted">{t("alreadyConfirmed")}</p>}

      <ul className="mt-5 divide-y divide-line">
        {view.fields.map((f) => (
          <li key={f.key} className="grid gap-3 py-3 text-sm md:grid-cols-[11rem_1fr_12rem]">
            <div>
              <p className="font-semibold">{label(f.key)}</p>
              <p className="mt-1 flex flex-wrap gap-1.5">
                <Badge tone={f.needsCheck ? "gold" : "ok"} className="normal-case">{f.needsCheck ? t("conf_check") : t("conf_high")}<bdi className="ms-1.5">{Math.round(f.confidence * 100)}%</bdi></Badge>
                {f.recordValue !== null && <Badge tone={f.differs ? "danger" : "muted"} className="normal-case">{f.differs ? t("differs") : t("matches")}</Badge>}
              </p>
            </div>
            <div className="min-w-0">
              <label className="sr-only" htmlFor={`f-${f.key}`}>{label(f.key)}</label>
              {f.type === "clause" ? (
                <select id={`f-${f.key}`} className={field} value={cur(f)} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}>
                  {[...new Set([String(f.value), ...(CLAUSE_CODES[f.key] ?? [])])].map((c) => <option key={c} value={c}>{c === "unrecognised" ? t("unrecognised") : cl(`${f.key.slice(7)}_${c}` as "break_none")}</option>)}
                </select>
              ) : (
                <input id={`f-${f.key}`} className={field} dir={f.type === "text" ? "auto" : "ltr"} value={cur(f)} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))} inputMode={f.type === "number" || f.type === "money" || f.type === "percent" || f.type === "months" ? "decimal" : undefined} />
              )}
              <p className="mt-1 text-xs text-muted">{t("colRecord")}: <bdi>{fmtRecord(f)}</bdi></p>
              {f.conflict && <p className="mt-1 text-xs text-danger">{t("conflict", { en: String(f.conflict.en), ar: String(f.conflict.ar) })}</p>}
              <details className="mt-1 text-xs text-muted"><summary className="cursor-pointer">{t("colSource")} · {t("page", { n: f.page })} · {f.langs.length === 2 ? t("bothLangs") : f.langs[0] === "ar" ? t("onlyAr") : t("onlyEn")}</summary><p dir="auto" className="mt-1 rounded bg-surface-2 p-2">{f.snippet}</p></details>
            </div>
            <div className="flex items-start md:justify-end">
              {needs(f) ? (
                <label className="flex min-h-10 cursor-pointer items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--gold-fill)]" checked={checked.has(f.key)} onChange={(e) => setChecked((p) => { const n = new Set(p); if (e.target.checked) n.add(f.key); else n.delete(f.key); return n; })} />{t("checked")}</label>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="gold" onClick={confirm} disabled={pending || missing.length > 0}>{t("confirm")}</Button>
        <p className="text-xs text-muted">{missing.length > 0 ? t("err_unchecked") : t("confirmHelp")}</p>
      </div>
      {result && <p role={result.tone === "danger" ? "alert" : "status"} className={cn("mt-3 flex gap-2 text-sm", result.tone === "ok" ? "text-ok" : "text-danger")}>{result.tone === "ok" && <CheckCircle2 aria-hidden="true" size={16} className="mt-0.5 shrink-0" />}{result.text}</p>}
    </Card>
  );
}
