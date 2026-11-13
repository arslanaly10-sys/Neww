import "server-only";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { withSession } from "@/db/client";
import { documents, districts, horusFiles, investorUpdates, marketSeries, valuations } from "@/db/schema";
import { getAlerts } from "../alerts-service";
import { getLeasing } from "../leasing";
import { getFinance } from "../finance";
import { boardOrder, listWork } from "../work";
import { upcoming } from "../calendar";
import { getPortfolio, type PortfolioRow } from "../access";
import { getAggregateIncome } from "../portfolio-data";
import { momentum3m, portfolioMetrics, sentiment } from "../metrics";
import { assessRisk } from "../risk";
import { DEMO_TODAY } from "../assumptions";
import { can } from "../permissions";
import { dateFmt, money, pct } from "../format";
import type { CurrentUser } from "../session";
import type { HorusCtx, ToolOut } from "./types";

/**
 * Deterministic functions Horus may call. The model never computes: it asks one of these and quotes the result.
 * Every function runs under the signed-in user's row-level security, so a role never receives rows it may not see.
 * Each output carries ready-made display strings (in the user's language and currency) and the citation ids that back it.
 */
const sess = (c: HorusCtx) => ({ userId: c.user.id, role: c.user.role });
const asUser = (c: HorusCtx) => c.user as unknown as CurrentUser;
const days = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
const money$ = (c: HorusCtx) => (egp: number) => ({ egp, display: money(egp, c.currency, c.locale, { fx: c.fx, compact: true }), full: money(egp, c.currency, c.locale, { fx: c.fx }) });

export const TOOLS = [
  { name: "portfolio_summary", description: "Portfolio totals: number of assets, total value, cost, unrealised gain, income-producing units, vacant units and the aggregate net yield for the last 12 months.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "list_assets", description: "List assets, optionally filtered. Use for questions about which assets are vacant, in a district, or of a type, or about the largest holdings.", input_schema: { type: "object", properties: { occupancy: { type: "string", enum: ["let", "vacant", "owner", "land"] }, districtId: { type: "string" }, type: { type: "string", enum: ["apartment", "villa", "office", "retail", "land", "mixed"] }, sortBy: { type: "string", enum: ["value", "id"] }, limit: { type: "integer", minimum: 1, maximum: 30 } }, additionalProperties: false } },
  { name: "asset_detail", description: "Everything on record about one asset: facts, value and cost, lease, documents and the deterministic risk score.", input_schema: { type: "object", properties: { assetId: { type: "string", description: "e.g. A-001" } }, required: ["assetId"], additionalProperties: false } },
  { name: "expiring_leases", description: "Leases that end within a number of days of the data date, with the days remaining.", input_schema: { type: "object", properties: { withinDays: { type: "integer", minimum: 1, maximum: 730 } }, additionalProperties: false } },
  { name: "document_gaps", description: "Documents that are missing, expired or pending, with the asset each belongs to.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "district_market", description: "Sample market index, three-month momentum and sentiment label for one district or all districts, with the source and publication note.", input_schema: { type: "object", properties: { districtId: { type: "string" } }, additionalProperties: false } },
  { name: "concentration", description: "Share of portfolio value by district.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "explain_valuation", description: "Explain a valuation: the model estimate, each driver's effect, the range, confidence, the five comparable sales and any human adjustment with its reason. Defaults to the most recent valuation.", input_schema: { type: "object", properties: { valuationId: { type: "string", description: "e.g. V-0001" } }, additionalProperties: false } },
  { name: "rent_arrears", description: "Rent collection (managers only): this month's collection rate, overdue rent by age (0-30, 31-60, 61-90, over 90 days) and the tenants who owe the most, with the lease and days overdue.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "finance_summary", description: "Finance. For managers: income, costs and net operating income over the last 12 months, the 12-month forecast, the largest budget variances this year and the suggested next distribution. For investors: the distributions paid to them.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "work_orders", description: "Maintenance requests and team tasks: how many are open, overdue and urgent, and the most pressing ones with their asset, assignee and due date.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "calendar_upcoming", description: "What is on the calendar in the next days (default 14): meetings, inspections, viewings and deadlines, plus leases ending, work due, distributions paid and, for managers, rent due and scheduled reports. Each with its date, time and asset.", input_schema: { type: "object", properties: { withinDays: { type: "integer", minimum: 1, maximum: 90 } }, additionalProperties: false } },
  { name: "recent_updates", description: "Latest published investor updates (title, date, text).", input_schema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 12 } }, additionalProperties: false } },
] as const;

/** Tools that only make sense in some conversations are added by the gateway. */
export const ALERTS_TOOL = { name: "open_alerts", description: "Open alerts the user can act on (lease renewals, missing documents, valuation drift, vacancy cost), each with its key, asset and severity. Use the key to propose snoozing an alert.", input_schema: { type: "object", properties: {}, additionalProperties: false } } as const;
export const FILE_TOOL = { name: "read_file", description: "Read the text of a file the user attached to this conversation. Quote it; never guess at parts that are not in the text.", input_schema: { type: "object", properties: { fileId: { type: "string", description: "e.g. F-ab12cd" } }, required: ["fileId"], additionalProperties: false } } as const;

export const TOOL_NAMES = TOOLS.map((t) => t.name) as string[];
type Args = Record<string, unknown>;

async function portfolio(c: HorusCtx) { return getPortfolio(asUser(c)); }

const impl: Record<string, (c: HorusCtx, a: Args) => Promise<ToolOut>> = {
  async portfolio_summary(c) {
    const rows = await portfolio(c);
    const m = portfolioMetrics(rows);
    const agg = await getAggregateIncome();
    const f = money$(c);
    return {
      cites: ["calc:portfolio_summary"],
      data: {
        assetCount: m.count, value: f(m.value), cost: f(m.cost), unrealisedGain: f(m.gain), unrealisedGainPct: pct(m.gainPct, c.locale),
        incomeProducingUnits: m.incomeUnits, vacantUnits: rows.filter((r) => r.occupancy === "vacant").length,
        netYield12m: pct(agg.net / m.value, c.locale), netYieldPeriod: `${dateFmt(agg.from, c.locale)} – ${dateFmt(agg.to, c.locale)}`,
        note: c.user.role === "investor" ? "Net yield is an aggregate; individual asset income is not available to this role." : undefined,
      },
    };
  },

  async list_assets(c, a) {
    let rows = await portfolio(c);
    if (a.occupancy) rows = rows.filter((r) => r.occupancy === a.occupancy);
    if (a.districtId) rows = rows.filter((r) => r.districtId === a.districtId);
    if (a.type) rows = rows.filter((r) => r.type === a.type);
    rows = [...rows].sort((x, y) => (a.sortBy === "id" ? x.id.localeCompare(y.id) : y.valueEgp - x.valueEgp));
    const total = rows.length;
    rows = rows.slice(0, Math.min(Number(a.limit ?? 10), 30));
    const f = money$(c);
    return {
      cites: rows.map((r) => `asset:${r.id}`),
      data: { matchingCount: total, shown: rows.length, assets: rows.map((r) => ({ id: r.id, name: c.locale === "ar" ? r.nameAr : r.name, district: c.locale === "ar" ? r.district.nameAr : r.district.name, type: r.type, occupancy: r.occupancy, value: f(r.valueEgp), vacantSince: r.vacantSince ? dateFmt(r.vacantSince, c.locale) : undefined })) },
    };
  },

  async asset_detail(c, a) {
    const all = await portfolio(c);
    const r = all.find((x) => x.id === String(a.assetId));
    if (!r) return { cites: [], data: { error: "asset_not_found" } };
    const docs = await withSession(sess(c), (tx) => tx.select().from(documents).where(eq(documents.assetId, r.id)));
    const share = portfolioMetrics(all).allocation.find((d) => d.id === r.districtId)!.value / portfolioMetrics(all).value;
    const risk = assessRisk({ occupancy: r.occupancy, vacantSince: r.vacantSince, leaseEnd: r.lease?.endDate ?? null, leaseCurrency: r.lease?.currency ?? null, docs, districtShare: share });
    const f = money$(c);
    const lease = r.lease;
    return {
      cites: [`asset:${r.id}`, ...(lease ? [`lease:${lease.id}`] : []), ...docs.map((d) => `doc:${d.id}`), `calc:risk_${r.id}`],
      data: {
        id: r.id, name: c.locale === "ar" ? r.nameAr : r.name, district: c.locale === "ar" ? r.district.nameAr : r.district.name, type: r.type, areaSqm: r.areaSqm,
        value: f(r.valueEgp), cost: f(r.costEgp), occupancy: r.occupancy, valueSetOn: dateFmt(r.valueSetOn, c.locale), valueSource: r.valueSource,
        lease: lease ? { id: lease.id, tenant: c.locale === "ar" ? lease.tenant.nameAr : lease.tenant.name, start: dateFmt(lease.startDate, c.locale), end: dateFmt(lease.endDate, c.locale), daysRemaining: days(DEMO_TODAY, lease.endDate), monthlyRent: lease.monthlyRent === null ? "hidden for this role" : `${lease.currency} ${lease.monthlyRent}` } : null,
        documents: docs.map((d) => ({ id: d.id, kind: d.kind, status: d.status })),
        risk: { score: risk.score, band: risk.band, drivers: risk.drivers.map((d) => ({ driver: d.key, score: d.score, reason: d.reason.id, params: d.reason.params })) },
      },
    };
  },

  async expiring_leases(c, a) {
    const within = Number(a.withinDays ?? 120);
    const rows = (await portfolio(c)).filter((r) => r.lease && days(DEMO_TODAY, r.lease.endDate) <= within).sort((x, y) => x.lease!.endDate.localeCompare(y.lease!.endDate));
    return {
      cites: rows.flatMap((r) => [`lease:${r.lease!.id}`, `asset:${r.id}`]),
      data: { withinDays: within, count: rows.length, leases: rows.map((r) => ({ leaseId: r.lease!.id, assetId: r.id, asset: c.locale === "ar" ? r.nameAr : r.name, tenant: c.locale === "ar" ? r.lease!.tenant.nameAr : r.lease!.tenant.name, endDate: dateFmt(r.lease!.endDate, c.locale), daysRemaining: days(DEMO_TODAY, r.lease!.endDate) })) },
    };
  },

  async document_gaps(c) {
    const docs = await withSession(sess(c), (tx) => tx.select().from(documents).where(ne(documents.status, "verified")));
    const rows = await portfolio(c);
    const name = (id: string) => { const r = rows.find((x) => x.id === id); return r ? (c.locale === "ar" ? r.nameAr : r.name) : id; };
    return {
      cites: docs.flatMap((d) => [`doc:${d.id}`, `asset:${d.assetId}`]),
      data: { count: docs.length, documents: docs.map((d) => ({ id: d.id, assetId: d.assetId, asset: name(d.assetId), kind: d.kind, status: d.status, expiresOn: d.expiresOn ? dateFmt(d.expiresOn, c.locale) : undefined })) },
    };
  },

  async district_market(c, a) {
    const ds = await withSession(sess(c), (tx) => tx.select().from(districts));
    const series = await withSession(sess(c), (tx) => tx.select().from(marketSeries).orderBy(marketSeries.month));
    const picked = ds.filter((d) => !a.districtId || d.id === a.districtId);
    const out = picked.map((d) => {
      const v = series.filter((s) => s.districtId === d.id).map((s) => Number(s.priceIndex));
      const m = momentum3m(v);
      return { id: d.id, district: c.locale === "ar" ? d.nameAr : d.name, latestIndex: v[v.length - 1].toFixed(1), momentum3m: pct(m, c.locale), sentiment: sentiment(m) };
    });
    return {
      cites: picked.map((d) => `market:${d.id}`),
      data: { districts: out, source: "Synthetic sample series generated for this demo (published 1 Nov 2026). Not CBE or CAPMAS data.", rule: "Cooling below -1%, Stable within plus or minus 1%, Warming above +1% over three months." },
    };
  },

  async concentration(c) {
    const m = portfolioMetrics(await portfolio(c));
    return {
      cites: ["calc:concentration"],
      data: { districts: m.allocation.map((d) => ({ id: d.id, district: c.locale === "ar" ? d.nameAr : d.name, share: pct(d.value / m.value, c.locale), assets: d.count })) },
    };
  },

  async explain_valuation(c, a) {
    const rows = await withSession(sess(c), (tx) => tx.select().from(valuations).where(a.valuationId ? eq(valuations.id, String(a.valuationId)) : inArray(valuations.status, ["confirmed", "in_review"])).orderBy(desc(valuations.createdAt)).limit(1));
    const v = rows[0];
    if (!v) return { cites: [], data: { error: "valuation_not_found" } };
    const r = v.result as { drivers: { key: string; factor: number | null; deltaEgp: number; valueAfterEgp: number }[]; lowEgp: number; highEgp: number; spreadPct: number; confidence: { level: string; dispersion: number | null }; comps: { id: string; soldOn: string; areaSqm: number; priceEgp: number; similarity: number }[]; compsImpliedEgp: number | null; driftVsCompsPct: number | null };
    const f = money$(c);
    return {
      cites: [`valuation:${v.id}`, ...r.comps.map((x) => `sale:${x.id}`)],
      data: {
        id: v.id, assetId: v.assetId, status: v.status, assumptionSet: v.assumptionSetId, modelEstimate: f(v.modelEstimateEgp), finalValue: v.finalValueEgp ? f(v.finalValueEgp) : null,
        adjustment: v.finalValueEgp ? pct(v.finalValueEgp / v.modelEstimateEgp - 1, c.locale) : null, adjustmentReason: v.adjustmentReason,
        range: { low: f(r.lowEgp), high: f(r.highEgp), spreadPct: `${r.spreadPct}%` }, confidence: r.confidence.level,
        drivers: r.drivers.map((d) => ({ driver: d.key, factor: d.factor === null ? null : d.factor.toFixed(3), effect: f(d.deltaEgp), valueAfter: f(d.valueAfterEgp) })),
        comparables: r.comps.map((x) => ({ id: x.id, soldOn: dateFmt(x.soldOn, c.locale), areaSqm: x.areaSqm, price: f(x.priceEgp), similarity: pct(x.similarity, c.locale, 0) })),
        comparablesImplied: r.compsImpliedEgp ? f(r.compsImpliedEgp) : null, driftVsComparables: r.driftVsCompsPct === null ? null : `${r.driftVsCompsPct}%`,
      },
    };
  },

  async open_alerts(c) {
    const { open } = await getAlerts(asUser(c));
    const sev = { high: 0, medium: 1, low: 2 } as const;
    const rows = [...open].sort((a, b) => sev[a.severity] - sev[b.severity]).slice(0, 15);
    return {
      cites: rows.flatMap((x) => [`alert:${x.key}`, `asset:${x.assetId}`]),
      data: { count: open.length, alerts: rows.map((x) => ({ key: x.key, kind: x.kind, severity: x.severity, assetId: x.assetId, asset: c.locale === "ar" ? x.assetNameAr : x.assetName, detail: x.detail })) },
    };
  },

  async read_file(c, a) {
    const id = String(a.fileId ?? "");
    if (!(c.fileIds ?? []).includes(id)) return { cites: [], data: { error: "file_not_attached" } };
    const [f] = await withSession(sess(c), (tx) => tx.select().from(horusFiles).where(eq(horusFiles.id, id)));
    if (!f) return { cites: [], data: { error: "file_not_found" } };
    return { cites: [`file:${f.id}`], data: { id: f.id, name: f.name, pages: f.pages, text: f.text.slice(0, 14000), truncated: f.text.length > 14000 } };
  },

  async rent_arrears(c) {
    if (!can(c.user.role, "rent.manage")) return { cites: [], data: { error: "forbidden" } };
    const d = await getLeasing(asUser(c));
    if (!d?.rent) return { cites: [], data: { error: "forbidden" } };
    const f = money$(c);
    const owing = d.tenants.filter((x) => (x.arrearsEgp ?? 0) > 0).sort((a, b) => (b.arrearsEgp ?? 0) - (a.arrearsEgp ?? 0)).slice(0, 8);
    return {
      cites: ["calc:rent_arrears", ...owing.flatMap((x) => x.leases.map((l) => `lease:${l.id}`))],
      data: {
        collectionThisMonth: d.rent.month.rate === null ? null : pct(d.rent.month.rate, c.locale, 0), collected: f(d.rent.month.collected), billed: f(d.rent.month.billed),
        totalOverdue: f(d.rent.aging.total), byAge: { "0-30 days": f(d.rent.aging.buckets.d0_30), "31-60 days": f(d.rent.aging.buckets.d31_60), "61-90 days": f(d.rent.aging.buckets.d61_90), "over 90 days": f(d.rent.aging.buckets.d90p) },
        tenantsOwing: owing.map((x) => ({ tenant: c.locale === "ar" ? x.nameAr : x.name, leases: x.leases.map((l) => l.id), owed: f(x.arrearsEgp ?? 0), oldestDaysOverdue: x.oldestOverdueDays })),
      },
    };
  },

  async finance_summary(c) {
    const fin = await getFinance(asUser(c));
    if (!fin) return { cites: [], data: { error: "forbidden" } };
    const f = money$(c);
    const paid = fin.distributions.filter((x) => x.status === "paid");
    const dist = { totalPaid: f(fin.totalPaid), latest: paid[0] ? { id: paid[0].id, period: paid[0].period, amount: f(paid[0].amountEgp), paidOn: paid[0].paidOn ? dateFmt(paid[0].paidOn, c.locale) : null } : null };
    if (!fin.money) return { cites: ["calc:finance_summary"], data: { distributions: dist } };
    const worst = [...fin.bva].filter((v) => v.unfavourable).sort((a, b) => a.variance - b.variance)[0];
    return {
      cites: ["calc:finance_summary"],
      data: {
        last12Months: { income: f(fin.totals.income), costs: f(-fin.totals.costs), netOperatingIncome: f(fin.totals.noi), margin: fin.totals.income ? pct(fin.totals.noi / fin.totals.income, c.locale, 0) : null },
        forecastNext12Months: f(fin.forecastTotals.noi),
        largestBudgetShortfall: worst ? { category: worst.category, shortBy: f(Math.abs(worst.variance)), pct: worst.pct === null ? null : pct(Math.abs(worst.pct), c.locale, 0) } : null,
        nextDistribution: { period: fin.nextDistribution.period, quarterNoi: f(fin.nextDistribution.noi), suggested: f(fin.nextDistribution.suggested), alreadyProposed: !fin.nextDistribution.canPropose },
        distributions: dist,
      },
    };
  },

  async work_orders(c) {
    const w = await listWork(asUser(c));
    if (!w) return { cites: [], data: { error: "forbidden" } };
    const active = w.items.filter((x) => ["open", "in_progress", "on_hold"].includes(x.status)).sort(boardOrder);
    const top = active.slice(0, 6);
    return {
      cites: ["calc:work_orders", ...top.map((x) => `work:${x.id}`)],
      data: {
        open: active.length, overdue: active.filter((x) => x.overdue).length, urgent: active.filter((x) => x.priority === "urgent").length, unassigned: active.filter((x) => !x.assigneeId).length,
        mostPressing: top.map((x) => ({ id: x.id, title: x.title, asset: x.assetId ? (c.locale === "ar" ? x.assetNameAr : x.assetName) : null, priority: x.priority, status: x.status, overdue: x.overdue, due: x.dueOn ? dateFmt(x.dueOn, c.locale) : null, assignee: x.assigneeId ? (c.locale === "ar" ? x.assigneeNameAr : x.assigneeName) : null })),
      },
    };
  },

  async calendar_upcoming(c, a) {
    const n = Math.min(90, Math.max(1, Number(a.withinDays) || 14));
    const items = await upcoming(asUser(c), c.locale === "ar" ? "ar" : "en", n);
    if (!items) return { cites: [], data: { error: "forbidden" } };
    return {
      cites: ["calc:calendar_upcoming"],
      data: {
        from: dateFmt(DEMO_TODAY, c.locale), withinDays: n, count: items.length,
        items: items.slice(0, 12).map((x) => ({ date: dateFmt(x.date, c.locale), time: x.start, title: x.title, kind: x.source, asset: x.assetName, overdue: x.overdue || undefined })),
      },
    };
  },

  async recent_updates(c, a) {
    const rows = await withSession(sess(c), (tx) => tx.select().from(investorUpdates).where(and(eq(investorUpdates.status, "published"))).orderBy(desc(investorUpdates.postedOn)).limit(Math.min(Number(a.limit ?? 3), 12)));
    return { cites: rows.map((u) => `update:${u.id}`), data: { count: rows.length, updates: rows.map((u) => ({ id: u.id, date: dateFmt(u.postedOn, c.locale), title: c.locale === "ar" ? u.titleAr : u.title, text: c.locale === "ar" ? u.bodyAr : u.body })) } };
  },
};

export async function runTool(name: string, args: Args, c: HorusCtx): Promise<ToolOut> {
  const fn = impl[name];
  if (!fn) return { cites: [], data: { error: "unknown_tool" } };
  if (!can(c.user.role, "horus.use")) return { cites: [], data: { error: "forbidden" } };
  try { return await fn(c, args ?? {}); } catch { return { cites: [], data: { error: "tool_failed" } }; }
}
export type { PortfolioRow };
