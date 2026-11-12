import "server-only";
import { getTranslations } from "next-intl/server";
import { runTool } from "./tools";
import { DEMO_TODAY } from "../assumptions";
import { dateFmt } from "../format";
import { normaliseDigits } from "./validate";
import type { Block, Draft, HorusAnswer, HorusCtx, Notice } from "./types";

/**
 * Scripted fallback used when no API key is set, the rate limit is hit or the model call fails.
 * It calls the same deterministic tools as the live path and writes the answer from fixed templates in both languages.
 * It recognises twelve kinds of question; anything else gets an honest "I can't verify that".
 */
export type Intent = "value" | "gain" | "yield" | "units" | "vacant" | "expiring" | "docs" | "largest" | "concentration" | "market" | "valuation" | "draft" | "asset" | "advice";

export const SUGGESTED: Intent[] = ["value", "gain", "yield", "units", "vacant", "expiring", "docs", "largest", "concentration", "market", "valuation", "draft"];

const KEYS: [Intent, RegExp][] = [
  ["advice", /should i (sell|buy|hold|invest)|recommend|predict|forecast|will (prices?|it) (rise|fall|go)|best time to|هل (أبيع|أشتري|أحتفظ)|توصي|توقع|تنبؤ|أفضل وقت/i],
  ["draft", /draft|write (an? )?update|investor update|مسودة|صياغة|اكتب|مستجدات المستثمر/i],
  ["valuation", /valuation|explain.*(value|number)|how was.*(valued|value)|تقييم|اشرح|كيف (قُيّم|حُسب)/i],
  ["units", /income[- ]producing|how many (units|assets)|units produce|produce income|leased units|وحدات مدرّة|مدرة للدخل|تدرّ دخلاً|تدر دخلا|كم وحدة|الوحدات المؤجرة/i],
  ["vacant", /vacan|empty|unlet|شاغر|شغور|فارغ/i],
  ["expiring", /lease|expir|renew|ending soon|عقد|عقود|ينتهي|تنتهي|تجديد|انتهاء/i],
  ["docs", /document|deed|insurance|missing|مستند|عقد ملكية|تأمين|ناقص/i],
  ["largest", /largest|biggest|top holding|most valuable|أكبر|أعلى قيمة|أغلى/i],
  ["concentration", /concentrat|exposure|district share|allocation|تركز|التركز|توزيع|حصة|انكشاف/i],
  ["market", /market|momentum|cooling|warming|sentiment|سوق|السوق|زخم|تباطؤ|تحسّن|اتجاه/i],
  ["yield", /yield|return|net income|عائد|صافي الدخل/i],
  ["gain", /gain|profit|unrealis|appreciat|مكسب|ربح|أرباح|ارتفاع القيمة/i],
  ["value", /value|worth|how much|portfolio|قيمة|تبلغ|كم|المحفظة/i],
];
const ASSET_RE = /\bA[- ]?(\d{1,3})\b/i;

export function classify(q: string): { intent: Intent | null; assetId?: string } {
  const text = normaliseDigits(q);
  const m = text.match(ASSET_RE);
  if (m) return { intent: "asset", assetId: `A-${m[1].padStart(3, "0")}` };
  for (const [i, re] of KEYS) if (re.test(text)) return { intent: i };
  return { intent: null };
}

type TData = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const list = (xs: string[], sep: string) => xs.join(sep);

export async function scriptedAnswer(question: string, c: HorusCtx, notice: Notice): Promise<HorusAnswer> {
  const t = await getTranslations({ locale: c.locale, namespace: "horus" });
  const st = await getTranslations({ locale: c.locale, namespace: "status" });
  const dk = await getTranslations({ locale: c.locale, namespace: "docKind" });
  const ds = await getTranslations({ locale: c.locale, namespace: "docStatus" });
  const ty = await getTranslations({ locale: c.locale, namespace: "types" });
  const sep = t("sep");
  const { intent, assetId } = classify(question);
  const blocks: Block[] = [];
  let draft: Draft | null = null;
  const base = { question, mode: "scripted" as const, notice, dropped: 0, advice: false };
  const cannot = (): HorusAnswer => ({ ...base, blocks: [], cannotVerify: true, draft: null });

  if (!intent) return cannot();
  if (intent === "advice") return { ...base, blocks: [], cannotVerify: false, draft: null, advice: true };

  const run = async (name: string, args: Record<string, unknown> = {}) => runTool(name, args, c);
  const cites = (...o: { cites: string[] }[]) => [...new Set(o.flatMap((x) => x.cites))];

  switch (intent) {
    case "value": {
      const s = await run("portfolio_summary"); const d = s.data as TData;
      blocks.push({ text: t("s_value", { count: d.assetCount, value: d.value.display, cost: d.cost.display }), cites: s.cites });
      break;
    }
    case "gain": {
      const s = await run("portfolio_summary"); const d = s.data as TData;
      blocks.push({ text: t("s_gain", { gain: d.unrealisedGain.display, pct: d.unrealisedGainPct, value: d.value.display, cost: d.cost.display }), cites: s.cites });
      break;
    }
    case "yield": {
      const s = await run("portfolio_summary"); const d = s.data as TData;
      blocks.push({ text: t("s_yield", { yield: d.netYield12m, period: d.netYieldPeriod }), cites: s.cites });
      if (c.user.role === "investor") blocks.push({ text: t("s_yield_agg"), cites: s.cites });
      break;
    }
    case "units": {
      const s = await run("portfolio_summary"); const d = s.data as TData;
      blocks.push({ text: t("s_units", { units: d.incomeProducingUnits, count: d.assetCount }), cites: s.cites });
      break;
    }
    case "vacant": {
      const s = await run("list_assets", { occupancy: "vacant", sortBy: "id" }); const d = s.data as TData;
      blocks.push(d.matchingCount === 0 ? { text: t("s_vacant_none"), cites: ["calc:portfolio_summary"] } : {
        text: t("s_vacant", { n: d.matchingCount, list: list(d.assets.map((a: TData) => t("s_vacant_item", { name: a.name, id: a.id, district: a.district, since: a.vacantSince ?? "–" })), sep) }), cites: s.cites });
      break;
    }
    case "expiring": {
      const s = await run("expiring_leases", { withinDays: 120 }); const d = s.data as TData;
      blocks.push(d.count === 0 ? { text: t("s_expiring_none", { days: 120 }), cites: ["calc:portfolio_summary"] } : {
        text: t("s_expiring", { n: d.count, days: 120, list: list(d.leases.map((l: TData) => t("s_expiring_item", { name: l.asset, id: l.leaseId, date: l.endDate, left: l.daysRemaining })), sep) }), cites: s.cites });
      break;
    }
    case "docs": {
      const s = await run("document_gaps"); const d = s.data as TData;
      blocks.push(d.count === 0 ? { text: t("s_docs_none"), cites: ["calc:portfolio_summary"] } : {
        text: t("s_docs", { n: d.count, list: list(d.documents.map((x: TData) => t("s_docs_item", { kind: dk(x.kind), id: x.id, asset: x.asset, status: ds(x.status) })), sep) }), cites: s.cites });
      break;
    }
    case "largest": {
      const s = await run("list_assets", { sortBy: "value", limit: 5 }); const d = s.data as TData;
      blocks.push({ text: t("s_largest", { list: list(d.assets.map((a: TData) => t("s_largest_item", { name: a.name, id: a.id, value: a.value.display })), sep) }), cites: s.cites });
      break;
    }
    case "concentration": {
      const s = await run("concentration"); const d = s.data as TData;
      blocks.push({ text: t("s_conc", { list: list(d.districts.slice(0, 4).map((x: TData) => t("s_conc_item", { district: x.district, share: x.share })), sep) }), cites: s.cites });
      break;
    }
    case "market": {
      const s = await run("district_market"); const d = s.data as TData;
      const cooling = d.districts.filter((x: TData) => x.sentiment === "cooling");
      const warming = d.districts.filter((x: TData) => x.sentiment === "warming");
      const fmt = (xs: TData[]) => list(xs.map((x) => t("s_market_item", { district: x.district, m: x.momentum3m })), sep);
      blocks.push({ text: t("s_market_cooling", { n: cooling.length, list: cooling.length ? fmt(cooling) : t("none") }), cites: cooling.map((x: TData) => `market:${x.id}`).concat(cooling.length ? [] : ["market:" + d.districts[0].id]) });
      blocks.push({ text: t("s_market_warming", { n: warming.length, list: warming.length ? fmt(warming) : t("none") }), cites: warming.map((x: TData) => `market:${x.id}`).concat(warming.length ? [] : ["market:" + d.districts[0].id]) });
      blocks.push({ text: t("s_market_synthetic"), cites: ["market:" + d.districts[0].id] });
      break;
    }
    case "valuation": {
      const s = await run("explain_valuation", {}); const d = s.data as TData;
      if (d.error) return cannot();
      const top = [...d.drivers].filter((x: TData) => x.driver !== "base").sort((a: TData, b: TData) => Math.abs(b.effect.egp) - Math.abs(a.effect.egp)).slice(0, 3);
      blocks.push({ text: t("s_val_head", { id: d.id, asset: d.assetId ?? t("adHoc"), est: d.modelEstimate.display, final: (d.finalValue ?? d.modelEstimate).display, low: d.range.low.display, high: d.range.high.display, conf: t(`conf_${d.confidence}`) }), cites: [`valuation:${d.id}`] });
      blocks.push({ text: t("s_val_drivers", { list: list(top.map((x: TData) => t("s_val_driver_item", { driver: t(`drv_${x.driver}`), effect: x.effect.display, factor: x.factor })), sep) }), cites: [`valuation:${d.id}`] });
      blocks.push({ text: t("s_val_comps", { list: list(d.comparables.slice(0, 5).map((x: TData) => t("s_val_comp_item", { id: x.id, price: x.price.display })), sep) }), cites: d.comparables.slice(0, 5).map((x: TData) => `sale:${x.id}`) });
      if (d.adjustmentReason) blocks.push({ text: t("s_val_adjust", { pct: d.adjustment, reason: d.adjustmentReason }), cites: [`valuation:${d.id}`] });
      break;
    }
    case "asset": {
      const s = await run("asset_detail", { assetId }); const d = s.data as TData;
      if (d.error) return cannot();
      blocks.push({ text: t("s_asset", { name: d.name, id: d.id, district: d.district, type: ty(d.type), value: d.value.display, cost: d.cost.display, status: st(d.occupancy) }), cites: [`asset:${d.id}`] });
      blocks.push({ text: t("s_asset_risk", { score: d.risk.score, band: t(`band_${d.risk.band}`) }), cites: [`calc:risk_${d.id}`] });
      if (d.lease) blocks.push({ text: t("s_asset_lease", { tenant: d.lease.tenant, end: d.lease.end, left: d.lease.daysRemaining, id: d.lease.id }), cites: [`lease:${d.lease.id}`] });
      break;
    }
    case "draft": {
      if (c.user.role !== "manager") return { ...base, blocks: [{ text: t("s_draft_denied"), cites: [] }], cannotVerify: false, draft: null };
      const [s, v, e, dg] = await Promise.all([run("portfolio_summary"), run("list_assets", { occupancy: "vacant" }), run("expiring_leases", { withinDays: 120 }), run("document_gaps")]);
      const d = s.data as TData;
      draft = {
        title: t("s_draft_title", { date: dateFmt(DEMO_TODAY, c.locale) }),
        body: t("s_draft_body", { date: dateFmt(DEMO_TODAY, c.locale), count: d.assetCount, value: d.value.display, gain: d.unrealisedGain.display, units: d.incomeProducingUnits, yield: d.netYield12m, vacant: (v.data as TData).matchingCount, expiring: (e.data as TData).count, docs: (dg.data as TData).count }),
        cites: cites(s, v, e, dg),
      };
      blocks.push({ text: t("s_draft_intro"), cites: s.cites });
      break;
    }
  }
  return { ...base, blocks, cannotVerify: blocks.length === 0, draft };
}
