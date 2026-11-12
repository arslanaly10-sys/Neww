"use client";
import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Calculator, CheckCircle2, Send } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { runValuationAction, submitValuationAction } from "@/app/valuation-actions";
import type { ValuationResult } from "@/lib/valuation";
import { REASON_CODES } from "@/lib/reason-codes";
import { money, pct, type Currency } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, Button, Card } from "../ui";
import { ResultView } from "./result-view";

export interface AssetOption { id: string; name: string; nameAr: string; districtId: string; type: string; areaSqm: number; floor: number | null; finish: string; age: number | null }
export interface DistrictOption { id: string; name: string; nameAr: string }
const TYPES = ["apartment", "villa", "office", "retail", "land", "mixed"] as const;
const FINISHES = ["core_shell", "semi_finished", "fully_finished", "luxury"] as const;

const field = "min-h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-text";
const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted";

export function Workbench({ districts, assets, initialAssetId, currency, fx, role, threshold }: { districts: DistrictOption[]; assets: AssetOption[]; initialAssetId: string | null; currency: Currency; fx: number; role: string; threshold: number }) {
  const t = useTranslations("val");
  const ty = useTranslations("types");
  const fi = useTranslations("finish");
  const locale = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const start = assets.find((a) => a.id === initialAssetId) ?? null;

  const [assetId, setAssetId] = useState<string | null>(start?.id ?? null);
  const [districtId, setDistrictId] = useState(start?.districtId ?? districts[0].id);
  const [type, setType] = useState(start?.type ?? "apartment");
  const [area, setArea] = useState(String(start?.areaSqm ?? 150));
  const [floor, setFloor] = useState(start?.floor === null ? "" : String(start?.floor ?? 3));
  const [finish, setFinish] = useState(start?.finish ?? "fully_finished");
  const [age, setAge] = useState(start?.age === null ? "" : String(start?.age ?? 5));
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [match, setMatch] = useState<{ compound: string | null; assetId: string | null }>({ compound: null, assetId: null });
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();

  const [finalStr, setFinalStr] = useState("");
  const [code, setCode] = useState<string>("");
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState<{ id: string; required: number } | null>(null);

  const noFloor = type === "villa" || type === "land";
  const noAge = type === "land";
  const districtName = (d: string) => { const x = districts.find((y) => y.id === d); return ar ? x?.nameAr : x?.name; };

  const prefill = (id: string) => {
    const a = assets.find((x) => x.id === id);
    setAssetId(id || null); setResult(null); setSent(null);
    if (!a) return;
    setDistrictId(a.districtId); setType(a.type); setArea(String(a.areaSqm)); setFloor(a.floor === null ? "" : String(a.floor)); setFinish(a.finish); setAge(a.age === null ? "" : String(a.age));
  };

  const inputs = () => ({
    districtId, type, areaSqm: Number(area), floor: noFloor || floor === "" ? null : Number(floor), finish,
    buildingAge: noAge || age === "" ? null : Number(age), address: address.trim() || undefined,
  });
  const err = (e: string) => t(`err_${e}` as "err_invalid");

  const onRun = () => {
    setError(null); setSent(null);
    run(async () => {
      const res = await runValuationAction(inputs());
      if (!res.ok) { setError(err(res.error)); return; }
      setResult(res.result); setMatch({ compound: res.matchedCompound, assetId: res.matchedAssetId });
      setFinalStr(String(res.result.estimateEgp)); setCode(""); setReason("");
    });
  };

  const finalVal = Number(finalStr.replace(/[^\d]/g, ""));
  const adjPct = result && finalVal ? finalVal / result.estimateEgp - 1 : 0;
  const adjusted = !!result && finalVal !== result.estimateEgp;
  const needsTwo = Math.abs(adjPct) > threshold;
  const reasonOk = !adjusted || (!!code && reason.trim().length >= 10);
  const canSend = !!result && finalVal > 0 && reasonOk && Math.abs(adjPct) <= 0.5;

  const onSend = () => {
    if (!result) return;
    setError(null);
    run(async () => {
      const res = await submitValuationAction({
        inputs: inputs(), assetId, finalValueEgp: adjusted ? finalVal : null, reasonCode: adjusted ? code : null, reason: adjusted ? reason.trim() : null,
      });
      if (!res.ok) { setError(err(res.error)); return; }
      setSent({ id: res.id, required: res.requiredApprovals });
      router.refresh();
    });
  };

  const assetOptions = useMemo(() => [...assets].sort((a, b) => a.id.localeCompare(b.id)), [assets]);

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <Card className="h-fit">
        <h2 className="mb-4 font-display text-xl">{t("inputs")}</h2>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onRun(); }}>
          <div>
            <label htmlFor="v-asset" className={label}>{t("fromAsset")}</label>
            <select id="v-asset" className={field} value={assetId ?? ""} onChange={(e) => prefill(e.target.value)}>
              <option value="">{t("adHoc")}</option>
              {assetOptions.map((a) => <option key={a.id} value={a.id}>{a.id} · {ar ? a.nameAr : a.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="v-district" className={label}>{t("district")}</label>
            <select id="v-district" className={field} value={districtId} onChange={(e) => { setDistrictId(e.target.value); setResult(null); }}>
              {districts.map((d) => <option key={d.id} value={d.id}>{ar ? d.nameAr : d.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="v-type" className={label}>{t("type")}</label>
            <select id="v-type" className={field} value={type} onChange={(e) => { setType(e.target.value); setResult(null); }}>
              {TYPES.map((x) => <option key={x} value={x}>{ty(x)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="v-area" className={label}>{t("area")}</label>
              <input id="v-area" className={field} inputMode="numeric" type="number" min={20} max={20000} required value={area} onChange={(e) => { setArea(e.target.value); setResult(null); }} />
            </div>
            <div>
              <label htmlFor="v-floor" className={label}>{t("floor")}</label>
              <input id="v-floor" className={cn(field, noFloor && "opacity-50")} inputMode="numeric" type="number" min={0} max={60} disabled={noFloor} placeholder={noFloor ? t("notApplicable") : "0 = " + t("ground")} value={noFloor ? "" : floor} onChange={(e) => { setFloor(e.target.value); setResult(null); }} />
            </div>
          </div>
          <div>
            <label htmlFor="v-finish" className={label}>{t("finish")}</label>
            <select id="v-finish" className={field} value={finish} onChange={(e) => { setFinish(e.target.value); setResult(null); }}>
              {FINISHES.map((x) => <option key={x} value={x}>{fi(x)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="v-age" className={label}>{t("age")}</label>
            <input id="v-age" className={cn(field, noAge && "opacity-50")} inputMode="numeric" type="number" min={0} max={150} disabled={noAge} placeholder={noAge ? t("notApplicable") : undefined} value={noAge ? "" : age} onChange={(e) => { setAge(e.target.value); setResult(null); }} />
          </div>
          <div>
            <label htmlFor="v-address" className={label}>{t("address")} <span className="font-normal normal-case">({t("optional")})</span></label>
            <input id="v-address" className={field} maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} aria-describedby="v-address-help" />
            <p id="v-address-help" className="mt-1 text-xs text-muted">{t("addressHelp")}</p>
          </div>
          <Button type="submit" variant="gold" className="w-full" disabled={pending}><Calculator aria-hidden="true" size={16} />{pending && !result ? t("running") : t("run")}</Button>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </form>
      </Card>

      <div className="min-w-0 space-y-6">
        {!result ? (
          <Card className="grid min-h-48 place-items-center text-center text-muted"><p className="max-w-md">{t("empty")}</p></Card>
        ) : (
          <>
            {match.compound && <p className="rounded-md border border-line bg-surface-2 p-3 text-sm">{t("addressMatch", { compound: match.compound })} {match.assetId && <Link href={`/asset/${match.assetId}`} className="text-gold underline underline-offset-4">{match.assetId}</Link>}</p>}
            <ResultView r={result} currency={currency} fx={fx} districtName={districtName(districtId) ?? districtId} />

            <Card>
              <h3 className="mb-1 font-display text-xl">{t("humanStep")}</h3>
              <p className="mb-4 text-sm text-muted">{t("humanHelp", { pct: Math.round(threshold * 100) })}</p>
              {sent ? (
                <div role="status" className="flex gap-3 rounded-md border border-ok/50 p-4 text-sm">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-ok" size={18} />
                  <p>{t("sentOk", { id: sent.id, n: sent.required })}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="v-final" className={label}>{t("finalValue")} (EGP)</label>
                    <input id="v-final" className={field} inputMode="numeric" dir="ltr" value={finalStr ? Number(finalStr).toLocaleString("en-US") : ""} onChange={(e) => setFinalStr(e.target.value.replace(/[^\d]/g, ""))} />
                    <p className="mt-1 text-xs text-muted">{t("modelEstimate")}: <bdi>{money(result.estimateEgp, "EGP", locale)}</bdi> · {t("adjustment")}: <bdi>{pct(adjPct, locale)}</bdi> {needsTwo && <Badge tone="gold" className="ms-1 normal-case">{t("needsTwo")}</Badge>}</p>
                  </div>
                  {adjusted && (
                    <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
                      <div>
                        <label htmlFor="v-code" className={label}>{t("reasonCode")} *</label>
                        <select id="v-code" className={field} value={code} onChange={(e) => setCode(e.target.value)} required aria-required="true">
                          <option value="">{t("choose")}</option>
                          {REASON_CODES.map((c) => <option key={c} value={c}>{t(`rc_${c}` as "rc_other")}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="v-reason" className={label}>{t("reasonText")} *</label>
                        <textarea id="v-reason" rows={3} maxLength={500} className={cn(field, "py-2")} value={reason} onChange={(e) => setReason(e.target.value)} required aria-required="true" aria-describedby="v-reason-help" />
                        <p id="v-reason-help" className={cn("mt-1 text-xs", reason.trim().length < 10 ? "text-danger" : "text-muted")}>{t("reasonHelp", { n: reason.trim().length })}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="gold" onClick={onSend} disabled={!canSend || pending}><Send aria-hidden="true" size={16} />{role === "investor" ? t("sendForReview") : t("propose")}</Button>
                    {!canSend && adjusted && <span className="text-xs text-muted">{t("reasonMandatory")}</span>}
                  </div>
                  <p className="text-xs text-muted">{role === "investor" ? t("flowInvestor") : t("flowManager")}</p>
                </div>
              )}
              {sent && <p className="mt-3 text-xs text-muted"><a href="#queue" className="text-gold underline underline-offset-4">{t("toQueue")}</a></p>}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
