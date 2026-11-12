"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { CheckCircle2, RefreshCw, RotateCcw } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { publishScenarioSetAction, reproduceScenarioAction, runScenarioAction, saveScenarioAction } from "@/app/scenario-actions";
import type { RunOutput, SavedScenario, SetInfo } from "@/lib/scenario-service";
import type { CaseResult, ScenarioInputs } from "@/lib/scenario";
import { dateFmt, int, money, pct, type Currency } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, Button, Card } from "../ui";

const field = "min-h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-text";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted";
const KEYS = ["fx", "rate", "vacancy", "rentGrowth"] as const;
const STEP = { fx: 0.5, rate: 0.5, vacancy: 1, rentGrowth: 0.5 } as const;

export function ScenarioWorkbench({ initial, sets, saved, canSave, currency, fx: sampleFx }: { initial: RunOutput; sets: SetInfo[]; saved: SavedScenario[]; canSave: boolean; currency: Currency; fx: number }) {
  const t = useTranslations("scn");
  const ty = useTranslations("types");
  const st = useTranslations("status");
  const locale = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const base = initial.assumptions.base;

  const [inputs, setInputs] = useState<ScenarioInputs>({ ...base });
  const [setId, setSetId] = useState(initial.set.id);
  const [out, setOut] = useState<RunOutput>(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  // Live recalculation: debounced, latest request wins.
  useEffect(() => {
    const id = ++seq.current;
    setBusy(true);
    const h = setTimeout(async () => {
      try {
        const r = await runScenarioAction(inputs, setId);
        if (id !== seq.current) return;
        setBusy(false);
        if (r.ok) { setOut(r); setFailed(false); } else setFailed(true);
      } catch { if (id === seq.current) { setBusy(false); setFailed(true); } }
    }, 140);
    return () => clearTimeout(h);
  }, [inputs, setId]);

  const A = out.assumptions;
  const f = (egp: number, compact = true) => money(egp, currency, locale, { fx: sampleFx, compact });
  const isBase = KEYS.every((k) => inputs[k] === base[k]);
  const cases = [
    { k: "low" as const, c: out.result.low, hint: t("lowHint", { fx: A.cases.low.fx, rate: A.cases.low.rate, vac: A.cases.low.vacancy, g: A.cases.low.rentGrowth }) },
    { k: "central" as const, c: out.result.central, hint: t("centralHint") },
    { k: "high" as const, c: out.result.high, hint: t("highHint", { fx: A.cases.high.fx, rate: A.cases.high.rate, vac: A.cases.high.vacancy, g: A.cases.high.rentGrowth }) },
  ];
  const meta = useMemo(() => new Map(out.assets.map((a) => [a.id, a])), [out.assets]);
  const rows = useMemo(() => out.result.central.assets.map((a, i) => ({ a, low: out.result.low.assets[i], high: out.result.high.assets[i], m: meta.get(a.id)! }))
    .sort((x, y) => Math.abs(y.a.changePct) - Math.abs(x.a.changePct) || x.a.id.localeCompare(y.a.id)), [out, meta]);
  const bandTone = { low: "ok", medium: "gold", high: "danger" } as const;
  const chart = [{ n: t("baseLabel"), v: out.result.central.portfolio.baseValue }, { n: t("low"), v: out.result.low.portfolio.value }, { n: t("central"), v: out.result.central.portfolio.value }, { n: t("high"), v: out.result.high.portfolio.value }];
  const hi = Math.max(...chart.map((x) => x.v)) * 1.05; // bars start at zero so their heights are honest

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[21rem_1fr]">
      <div className="min-w-0 space-y-6 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-display text-xl">{t("inputs")}</h2>
            <span className="text-xs text-muted" role="status" aria-live="polite">{busy ? <span className="inline-flex items-center gap-1"><RefreshCw aria-hidden="true" size={12} className="animate-spin motion-reduce:animate-none" />{t("updating")}</span> : null}</span>
          </div>
          <div className="space-y-5">
            {KEYS.map((k) => {
              const [min, max] = A.sliders[k];
              const unit = k === "fx" ? t("unit_fx") : "%";
              return (
                <div key={k}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <label htmlFor={`sl-${k}`} className="text-sm font-semibold">{t(`sl_${k}`)}</label>
                    <span className="text-xs text-muted">{t("base", { v: `${base[k]}${k === "fx" ? "" : "%"}` })}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input id={`sl-${k}`} type="range" min={min} max={max} step={STEP[k]} value={inputs[k]} onChange={(e) => setInputs((p) => ({ ...p, [k]: Number(e.target.value) }))}
                      className="h-2 min-w-0 flex-1 accent-[var(--gold-fill)]" aria-valuetext={`${inputs[k]} ${unit}`} />
                    <label className="flex items-center gap-1">
                      <span className="sr-only">{t(`sl_${k}`)}</span>
                      <input type="number" dir="ltr" min={min} max={max} step={STEP[k]} value={inputs[k]} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setInputs((p) => ({ ...p, [k]: Math.min(max, Math.max(min, v)) })); }} className="min-h-11 w-20 rounded-md border border-line bg-surface px-2 text-sm" />
                      <span className="w-14 text-xs text-muted">{unit}</span>
                    </label>
                  </div>
                  <div dir="ltr" className="mt-0.5 flex justify-between text-[11px] text-muted"><span>{min}</span><span>{max}</span></div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 space-y-3">
            <div>
              <label htmlFor="sc-set" className={labelCls}>{t("set")}</label>
              <select id="sc-set" className={field} value={setId} onChange={(e) => setSetId(e.target.value)}>
                {sets.map((s, i) => <option key={s.id} value={s.id}>{s.id}{i === 0 ? ` (${t("latest")})` : ""}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted">{t("setHelp")}</p>
            </div>
            <Button size="sm" onClick={() => setInputs({ ...base })} disabled={isBase}><RotateCcw aria-hidden="true" size={14} />{t("reset")}</Button>
          </div>
          {failed && <p role="alert" className="mt-3 text-sm text-danger">{t("runError")}</p>}
        </Card>
      </div>

      <div className="min-w-0 space-y-6">
        <section className="grid gap-4 md:grid-cols-3" aria-label={t("portfolioValue")}>
          {cases.map(({ k, c, hint }) => <CaseCard key={k} id={k} title={t(k)} hint={hint} c={c} f={f} center={k === "central"} />)}
        </section>

        <Card>
          <h2 className="mb-3 font-display text-xl">{t("chartTitle")}</h2>
          <div dir="ltr" role="img" aria-label={`${t("chartTitle")}: ${chart.map((x) => `${x.n} ${f(x.v)}`).join(", ")}`} className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="n" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
                <YAxis domain={[0, hi]} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={58} tickFormatter={(v: number) => money(v, currency, "en", { fx: sampleFx, compact: true }).replace(/(EGP|USD) /, "")} />
                <Bar dataKey="v" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {chart.map((x, i) => <Cell key={x.n} fill={i === 0 ? "var(--muted)" : i === 2 ? "var(--gold-fill)" : "var(--teal)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <section>
          <h2 className="font-display text-2xl">{t("assetsTitle")}</h2>
          <p className="mb-3 text-xs text-muted">{t("sortNote")}</p>
          <ul className="space-y-3 md:hidden">
            {rows.map(({ a, m }) => (
              <li key={a.id}><Card className="p-4">
                <Link href={`/asset/${a.id}`} className="font-semibold text-gold underline-offset-4 hover:underline">{ar ? m.nameAr : m.name}</Link>
                <p className="mt-1 flex items-center justify-between gap-2 text-sm"><bdi className="font-display text-lg">{f(a.value)}</bdi><bdi className={a.changePct < 0 ? "text-danger" : "text-ok"}>{pct(a.changePct, locale)}</bdi></p>
                <p className="mt-1 text-xs text-muted">{t("colRisk")}: <bdi>{a.baseRisk} → {a.risk}</bdi> · {t("colYield")}: <bdi>{a.yield === null ? t("yieldHidden") : pct(a.yield, locale)}</bdi></p>
              </Card></li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border border-line md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">{t("assetsTitle")}</caption>
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>{[["colAsset", "start"], ["colBase", "end"], ["colCentral", "end"], ["colChange", "end"], ["colRange", "end"], ["colYield", "end"], ["colRisk", "end"]].map(([k, al]) => <th key={k} scope="col" className={cn("px-3 py-2.5 font-semibold", al === "end" ? "text-end" : "text-start")}>{t(k as "colAsset")}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(({ a, low, high, m }) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="px-3 py-2"><Link href={`/asset/${a.id}`} className="font-semibold text-gold underline-offset-4 hover:underline">{ar ? m.nameAr : m.name}</Link><span className="ms-2 text-xs text-muted">{ty(m.type as "villa")} · {st(m.occupancy as "let")}</span></td>
                    <td className="whitespace-nowrap px-3 py-2 text-end"><bdi className="text-muted">{f(a.baseValue)}</bdi></td>
                    <td className="whitespace-nowrap px-3 py-2 text-end"><bdi className="font-semibold">{f(a.value)}</bdi></td>
                    <td className="px-3 py-2 text-end"><bdi className={a.changePct < 0 ? "text-danger" : a.changePct > 0 ? "text-ok" : "text-muted"}>{pct(a.changePct, locale)}</bdi></td>
                    <td className="whitespace-nowrap px-3 py-2 text-end text-xs text-muted"><bdi>{f(low.value)}</bdi> – <bdi>{f(high.value)}</bdi></td>
                    <td className="px-3 py-2 text-end"><bdi className={a.yield === null ? "text-xs text-muted" : ""}>{a.yield === null ? "–" : pct(a.yield, locale)}</bdi></td>
                    <td className="whitespace-nowrap px-3 py-2 text-end"><Badge tone={bandTone[a.riskBand]} className="normal-case"><bdi>{a.baseRisk} → {a.risk}</bdi></Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {out.result.central.assets.every((a) => a.yield === null) && <p className="mt-2 text-xs text-muted">{t("yieldHidden")}</p>}
        </section>

        <p className="text-xs text-muted">{t("hashes", { rh: out.resultHash.slice(0, 12), bh: out.baseHash.slice(0, 12) })} {out.set.id}</p>

        <SavePanel canSave={canSave} inputs={inputs} setId={setId} />
        <SavedList saved={saved} onLoad={(s) => { setInputs(s.inputs); setSetId(s.assumptionSetId); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        <Register sets={sets} A={A} canSave={canSave} onPublished={() => router.refresh()} />
      </div>
    </div>
  );
}

function CaseCard({ id, title, hint, c, f, center }: { id: string; title: string; hint: string; c: CaseResult; f: (n: number, compact?: boolean) => string; center: boolean }) {
  const t = useTranslations("scn");
  const locale = useLocale();
  const p = c.portfolio;
  return (
    <Card className={cn("min-w-0", center && "border-gold/60")} id={`case-${id}`}>
      <p className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><span>{title}</span></p>
      <p className="mt-2 font-display text-3xl"><bdi>{f(p.value)}</bdi></p>
      <p className={cn("text-sm", p.changePct < 0 ? "text-danger" : p.changePct > 0 ? "text-ok" : "text-muted")}><bdi>{pct(p.changePct, locale)}</bdi> <span className="text-muted">{t("vsBase")}</span></p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-muted">{t("netYield")}</dt><dd className="text-sm font-semibold"><bdi>{pct(p.netYield, locale)}</bdi></dd></div>
        <div><dt className="text-muted">{t("avgRisk")}</dt><dd className="text-sm font-semibold"><bdi>{p.avgRisk.toFixed(1)}</bdi></dd></div>
        <div><dt className="text-muted">{t("highRisk")}</dt><dd className="text-sm font-semibold"><bdi>{int(p.highRiskCount, locale)}</bdi></dd></div>
      </dl>
      <p className="mt-3 text-[11px] leading-snug text-muted">{hint}</p>
    </Card>
  );
}

function SavePanel({ canSave, inputs, setId }: { canSave: boolean; inputs: ScenarioInputs; setId: string }) {
  const t = useTranslations("scn");
  const router = useRouter();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <h2 className="mb-3 font-display text-xl">{t("saveTitle")}</h2>
      {!canSave ? <p className="text-sm text-muted">{t("needManager")}</p> : (
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(e) => {
          e.preventDefault(); setMsg(null);
          start(async () => {
            const r = await saveScenarioAction({ name, notes, inputs, setId });
            if (!r.ok) { setMsg({ ok: false, text: t("nameError") }); return; }
            setMsg({ ok: true, text: t("saved", { id: r.id }) }); setName(""); setNotes(""); router.refresh();
          });
        }}>
          <div><label htmlFor="sc-name" className={labelCls}>{t("name")}</label><input id="sc-name" className={field} value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={60} required /></div>
          <div><label htmlFor="sc-notes" className={labelCls}>{t("notes")}</label><input id="sc-notes" className={field} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} /></div>
          <Button type="submit" variant="gold" disabled={pending}>{pending ? t("working") : t("save")}</Button>
        </form>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={cn("mt-3 flex gap-2 text-sm", msg.ok ? "text-ok" : "text-danger")}>{msg.ok && <CheckCircle2 aria-hidden="true" size={16} className="mt-0.5 shrink-0" />}{msg.text}</p>}
    </Card>
  );
}

function SavedList({ saved, onLoad }: { saved: SavedScenario[]; onLoad: (s: SavedScenario) => void }) {
  const t = useTranslations("scn");
  const locale = useLocale();
  const [res, setRes] = useState<Record<string, { tone: "ok" | "gold" | "danger"; text: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const reproduce = async (s: SavedScenario) => {
    setBusy(s.id);
    try {
      const r = await reproduceScenarioAction(s.id);
      if (!r.ok) setRes((p) => ({ ...p, [s.id]: { tone: "danger", text: t("repFail") } }));
      else if (!r.assumptionsIntact) setRes((p) => ({ ...p, [s.id]: { tone: "danger", text: t("repAssump", { set: r.setId }) } }));
      else if (r.identical) setRes((p) => ({ ...p, [s.id]: { tone: "ok", text: t("repIdentical", { hash: r.nowResultHash.slice(0, 12), set: `${r.setId}` }) } }));
      else setRes((p) => ({ ...p, [s.id]: { tone: "gold", text: t("repBase") } }));
    } catch { setRes((p) => ({ ...p, [s.id]: { tone: "danger", text: t("repFail") } })); }
    setBusy(null);
  };
  return (
    <Card>
      <h2 className="mb-3 font-display text-xl">{t("savedTitle")}</h2>
      {saved.length === 0 ? <p className="text-sm text-muted">{t("noSaved")}</p> : (
        <ul className="divide-y divide-line">
          {saved.map((s) => (
            <li key={s.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p><span className="num font-semibold text-gold">{s.id}</span> <span className="font-semibold">{s.name}</span></p>
                  <p className="text-xs text-muted">{t("by", { name: locale === "ar" ? s.ownerNameAr : s.ownerName })} · <bdi>{dateFmt(s.createdAt.slice(0, 10), locale)}</bdi> · <span className="num">{s.assumptionSetId}</span></p>
                  <p className="mt-1 text-xs text-muted">{t("params", { fx: s.inputs.fx, rate: s.inputs.rate, vac: s.inputs.vacancy, g: s.inputs.rentGrowth })}</p>
                  {s.notes && <p className="mt-1 text-xs">{s.notes}</p>}
                </div>
                <div className="flex gap-2"><Button size="sm" onClick={() => onLoad(s)}>{t("load")}</Button><Button size="sm" onClick={() => reproduce(s)} disabled={busy === s.id}>{busy === s.id ? t("working") : t("reproduce")}</Button></div>
              </div>
              {res[s.id] && <p role="status" className={cn("mt-2 rounded-md border p-2 text-xs", res[s.id].tone === "ok" ? "border-ok/50 text-ok" : res[s.id].tone === "gold" ? "border-gold/50 text-text" : "border-danger/50 text-danger")}>{res[s.id].text}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Register({ sets, A, canSave, onPublished }: { sets: SetInfo[]; A: RunOutput["assumptions"]; canSave: boolean; onPublished: () => void }) {
  const t = useTranslations("scn");
  const locale = useLocale();
  const [cap, setCap] = useState(String(A.capRatePassThrough));
  const [w, setW] = useState(String(A.incomeWeight.let));
  const [rp, setRp] = useState(String(A.rentGrowthPassThrough));
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Card>
        <h2 className="mb-1 font-display text-xl">{t("regTitle")}</h2>
        <p className="mb-3 text-sm text-muted">{t("regLead")}</p>
        <ul className="space-y-2">
          {sets.map((s, i) => (
            <li key={s.id} className="rounded-md border border-line p-3 text-sm">
              <p className="flex flex-wrap items-center gap-2"><span className="num font-semibold text-gold">{s.id}</span>{i === 0 && <Badge tone="gold">{t("latest")}</Badge>}<span className="text-xs text-muted">{t("regBy")} <bdi>{dateFmt(s.createdAt.slice(0, 10), locale)}</bdi></span></p>
              <p className="mt-1 text-muted">{s.note}</p>
              <p className="num mt-1 break-all font-mono text-[11px] text-muted">{t("regHash")}: {s.contentHash}</p>
            </li>
          ))}
        </ul>
        <h3 className="mb-2 mt-6 font-display text-lg">{t("publishTitle")}</h3>
        {!canSave ? <p className="text-sm text-muted">{t("managerOnly")}</p> : (
          <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => {
            e.preventDefault(); setMsg(null);
            start(async () => {
              const r = await publishScenarioSetAction({ capRatePassThrough: Number(cap), incomeWeightLet: Number(w), rentGrowthPassThrough: Number(rp), note });
              if (!r.ok) { setMsg({ ok: false, text: t("publishError") }); return; }
              setMsg({ ok: true, text: t("published", { id: r.id }) }); setNote(""); onPublished();
            });
          }}>
            <div><label htmlFor="rg-cap" className={labelCls}>{t("capPass")}</label><input id="rg-cap" dir="ltr" type="number" step="0.01" min="0.02" max="0.5" className={field} value={cap} onChange={(e) => setCap(e.target.value)} /></div>
            <div><label htmlFor="rg-w" className={labelCls}>{t("incomeW")}</label><input id="rg-w" dir="ltr" type="number" step="0.05" min="0.1" max="0.9" className={field} value={w} onChange={(e) => setW(e.target.value)} /></div>
            <div><label htmlFor="rg-rp" className={labelCls}>{t("rentPass")}</label><input id="rg-rp" dir="ltr" type="number" step="0.1" min="0.5" max="3" className={field} value={rp} onChange={(e) => setRp(e.target.value)} /></div>
            <div className="sm:col-span-3"><label htmlFor="rg-note" className={labelCls}>{t("regNote")}</label><input id="rg-note" className={field} value={note} onChange={(e) => setNote(e.target.value)} minLength={10} maxLength={300} required /></div>
            <div className="sm:col-span-3"><Button type="submit" variant="gold" disabled={pending}>{pending ? t("working") : t("publish")}</Button></div>
          </form>
        )}
        {msg && <p role={msg.ok ? "status" : "alert"} className={cn("mt-3 text-sm", msg.ok ? "text-ok" : "text-danger")}>{msg.text}</p>}
      </Card>
      <Card>
        <h2 className="mb-3 font-display text-xl">{t("howTitle")}</h2>
        <ul className="space-y-2 text-sm text-muted">
          <li>{t("how1", { cap: A.capRatePassThrough })}</li>
          <li>{t("how2", { w: Math.round(A.incomeWeight.let * 100) })}</li>
          <li>{t("how3", { w: Math.round(A.incomeWeight.let * 100), r: A.rentGrowthPassThrough })}</li>
          <li>{t("how4")}</li>
          <li>{t("how5")}</li>
        </ul>
      </Card>
    </>
  );
}
