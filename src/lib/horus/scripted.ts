import "server-only";
import { getTranslations } from "next-intl/server";
import { runTool } from "./tools";
import { DEMO_TODAY } from "../assumptions";
import { dateFmt } from "../format";
import { normaliseDigits } from "./validate";
import { searchHelp } from "../help/articles";
import type { Block, Draft, HorusAction, HorusAnswer, HorusCtx, Notice } from "./types";

/**
 * Scripted fallback used when no API key is set, the rate limit is hit or the model call fails.
 * It calls the same deterministic tools as the live path and writes the answer from fixed templates in both languages.
 * It recognises twelve kinds of question; anything else gets an honest "I can't verify that".
 */
export type Intent = "finance" | "arrears" | "file" | "snooze" | "startval" | "email" | "value" | "gain" | "yield" | "units" | "vacant" | "expiring" | "docs" | "largest" | "concentration" | "market" | "valuation" | "draft" | "asset" | "advice";

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
const SNOOZE_RE = /snooze|postpone|defer|أجّل|أجل|تأجيل/i;
const STARTVAL_RE = /(run|start|new|begin|open)\b.{0,20}valuation|valuation (for|of)\b|value (asset )?a[- ]?\d|ابدأ.{0,10}تقييم|تقييم جديد|شغّل.{0,10}تقييم|قيّم/i;
const EMAIL_RE = /e-?mail|mail to|بريد|إيميل|رسالة إلى/i;
const ARREARS_RE = /arrears|overdue|unpaid|behind on rent|owe|late (rent|payment)|rent collect|collection rate|متأخر|متأخرات|غير مدفوع|تحصيل/i;
const FINANCE_RE = /\bnoi\b|net operating|budget|cash ?flow|distribution|payout|expenses|operating costs|ميزانية|موازنة|توزيع|التدفق النقدي|صافي الدخل التشغيلي|مصروفات/i;
const FILE_RE = /file|attach|upload|this (document|pdf|lease)|summari[sz]e|الملف|مرفق|المرفق|لخّص|لخص|هذا المستند/i;

export function classify(q: string, hasFiles = false): { intent: Intent | null; assetId?: string } {
  const text = normaliseDigits(q);
  const m = text.match(ASSET_RE);
  const assetId = m ? `A-${m[1].padStart(3, "0")}` : undefined;
  if (hasFiles && FILE_RE.test(text)) return { intent: "file" };
  if (SNOOZE_RE.test(text)) return { intent: "snooze" };
  if (ARREARS_RE.test(text)) return { intent: "arrears" };
  if (FINANCE_RE.test(text) && !KEYS[0][1].test(text)) return { intent: "finance" };
  if (assetId && STARTVAL_RE.test(text)) return { intent: "startval", assetId };
  if (EMAIL_RE.test(text)) return { intent: "email" };
  if (assetId) return { intent: "asset", assetId };
  for (const [i, re] of KEYS) if (re.test(text)) return { intent: i };
  return hasFiles ? { intent: "file" } : { intent: null };
}

type TData = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const list = (xs: string[], sep: string) => xs.join(sep);

export async function scriptedAnswer(question: string, c: HorusCtx, notice: Notice, onStep?: (tool: string) => void): Promise<HorusAnswer> {
  const t = await getTranslations({ locale: c.locale, namespace: "horus" });
  const st = await getTranslations({ locale: c.locale, namespace: "status" });
  const dk = await getTranslations({ locale: c.locale, namespace: "docKind" });
  const ds = await getTranslations({ locale: c.locale, namespace: "docStatus" });
  const ty = await getTranslations({ locale: c.locale, namespace: "types" });
  const al = await getTranslations({ locale: c.locale, namespace: "al" });
  const sep = t("sep");
  const { intent, assetId } = classify(question, Boolean(c.fileIds?.length));
  const blocks: Block[] = [];
  const actions: HorusAction[] = [];
  let draft: Draft | null = null;
  const base = { question, mode: "scripted" as const, notice, dropped: 0, advice: false };
  const cannot = (): HorusAnswer => ({ ...base, blocks: [], cannotVerify: true, draft: null });

  if (!intent) return cannot();
  if (intent === "advice") return { ...base, blocks: [], cannotVerify: false, draft: null, advice: true };

  const run = async (name: string, args: Record<string, unknown> = {}) => { onStep?.(name); return runTool(name, args, c); };
  const cites = (...o: { cites: string[] }[]) => [...new Set(o.flatMap((x) => x.cites))];

  switch (intent) {
    case "finance": {
      const s = await run("finance_summary"); const d = s.data as TData;
      if (d.error) return cannot();
      const fc = await getTranslations({ locale: c.locale, namespace: "fin" });
      if (d.last12Months) {
        blocks.push({ text: t("s_fin", { income: d.last12Months.income.display, costs: d.last12Months.costs.display, noi: d.last12Months.netOperatingIncome.display, margin: d.last12Months.margin ?? "–", forecast: d.forecastNext12Months.display }), cites: s.cites });
        if (d.largestBudgetShortfall) blocks.push({ text: t("s_fin_budget", { category: fc(`c_${d.largestBudgetShortfall.category}` as "c_rent"), short: d.largestBudgetShortfall.shortBy.display, pct: d.largestBudgetShortfall.pct ?? "–" }), cites: s.cites });
        blocks.push({ text: t(d.nextDistribution.alreadyProposed ? "s_fin_next_done" : "s_fin_next", { period: d.nextDistribution.period, suggested: d.nextDistribution.suggested.display, noi: d.nextDistribution.quarterNoi.display }), cites: s.cites });
      }
      blocks.push(d.distributions.latest ? { text: t("s_fin_paid", { total: d.distributions.totalPaid.display, period: d.distributions.latest.period, amount: d.distributions.latest.amount.display }), cites: s.cites } : { text: t("s_fin_none"), cites: s.cites });
      break;
    }
    case "arrears": {
      if (c.user.role !== "manager") return { ...base, blocks: [{ text: t("s_arrears_denied"), cites: [] }], cannotVerify: false, draft: null };
      const s = await run("rent_arrears"); const d = s.data as TData;
      if (d.error) return cannot();
      blocks.push({ text: t("s_arrears", { rate: d.collectionThisMonth ?? "–", collected: d.collected.display, billed: d.billed.display, total: d.totalOverdue.display }), cites: ["calc:rent_arrears"] });
      blocks.push(d.tenantsOwing.length === 0 ? { text: t("s_arrears_none"), cites: ["calc:rent_arrears"] } : {
        text: t("s_arrears_who", { list: list(d.tenantsOwing.slice(0, 4).map((x: TData) => t("s_arrears_item", { tenant: x.tenant, owed: x.owed.display, days: x.oldestDaysOverdue, leases: x.leases.join(", ") })), sep) }),
        cites: d.tenantsOwing.slice(0, 4).flatMap((x: TData) => x.leases.map((id: string) => `lease:${id}`)),
      });
      break;
    }
    case "file": {
      for (const id of (c.fileIds ?? []).slice(0, 3)) {
        const f = await run("read_file", { fileId: id }); const d = f.data as TData;
        if (d.error) continue;
        const text = String(d.text).replace(/\[page \d+\]/g, " ").replace(/\s+/g, " ").trim();
        const dates = [...new Set(text.match(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/gi) ?? [])].slice(0, 6);
        const amounts = [...new Set(text.match(/(EGP|USD|E£|\$|جنيه)\s?\d[\d,]*\d(\.\d+)?|\d[\d,]{2,}\d(\.\d+)?\s?(EGP|USD|جنيه)/gi) ?? [])].slice(0, 6);
        const opening = text.split(/(?<=[.!?؟])\s/).slice(0, 2).join(" ").slice(0, 360);
        blocks.push({ text: t("s_file", { name: d.name, pages: d.pages, words: text.split(" ").length }), cites: f.cites });
        if (opening) blocks.push({ text: t("s_file_opening", { text: opening }), cites: f.cites });
        if (dates.length || amounts.length) blocks.push({ text: t("s_file_found", { dates: dates.length ? list(dates, sep) : t("none"), amounts: amounts.length ? list(amounts, sep) : t("none") }), cites: f.cites });
      }
      if (!blocks.length) return cannot();
      blocks.push({ text: t("s_file_scripted"), cites: [`file:${c.fileIds![0]}`] });
      break;
    }
    case "snooze": {
      if (c.user.role !== "manager") return { ...base, blocks: [{ text: t("s_action_denied"), cites: [] }], cannotVerify: false, draft: null };
      const s = await run("open_alerts"); const d = s.data as TData;
      const top = d.alerts?.[0];
      if (!top) { blocks.push({ text: t("s_snooze_none"), cites: ["calc:portfolio_summary"] }); break; }
      blocks.push({ text: t("s_snooze", { n: d.count, asset: top.asset, id: top.assetId, kind: al(`kind_${top.kind}` as "kind_lease_renewal"), severity: al(`sev_${top.severity}` as "sev_high") }), cites: [`alert:${top.key}`, `asset:${top.assetId}`] });
      actions.push({ kind: "snooze_alert", alertKey: top.key, label: top.asset, reason: t("s_snooze_reason") });
      break;
    }
    case "startval": {
      const s = await run("asset_detail", { assetId }); const d = s.data as TData;
      if (d.error) return cannot();
      blocks.push({ text: t("s_startval", { name: d.name, id: d.id, value: d.value.display }), cites: [`asset:${d.id}`] });
      actions.push({ kind: "start_valuation", assetId: d.id, label: d.name });
      break;
    }
    case "email": {
      if (c.user.role !== "manager") return { ...base, blocks: [{ text: t("s_action_denied"), cites: [] }], cannotVerify: false, draft: null };
      const [s, e] = await Promise.all([run("portfolio_summary"), run("expiring_leases", { withinDays: 120 })]);
      const d = s.data as TData;
      blocks.push({ text: t("s_email_intro"), cites: s.cites });
      actions.push({
        kind: "draft_email", to: "karim@sample.test",
        subject: t("s_email_subject", { date: dateFmt(DEMO_TODAY, c.locale) }),
        body: t("s_email_body", { count: d.assetCount, value: d.value.display, gain: d.unrealisedGain.display, expiring: (e.data as TData).count, name: c.user.name }),
      });
      break;
    }
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
  return { ...base, blocks, cannotVerify: blocks.length === 0 && actions.length === 0, draft, actions };
}

/** Help mode without a model: the best-matching help article, quoted, with links to the closest others. */
export async function scriptedHelp(question: string, c: HorusCtx, notice: Notice, publicOnly = false): Promise<HorusAnswer> {
  const lang = c.locale === "ar" ? "ar" : "en";
  const hits = searchHelp(question, { publicOnly, limit: 3 });
  const base = { question, mode: "scripted" as const, notice, dropped: 0, advice: false, draft: null };
  if (!hits.length) return { ...base, blocks: [], cannotVerify: true, help: [] };
  const top = hits[0].article;
  return {
    ...base, cannotVerify: false,
    blocks: [{ text: top.body[lang], cites: [`help:${top.id}`] }],
    help: hits.map((h) => ({ id: h.article.id, title: h.article.title[lang], href: h.article.href ?? null })),
  };
}
