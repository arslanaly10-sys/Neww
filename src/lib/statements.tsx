import "server-only";
import React from "react";
import { createHash } from "node:crypto";
import { createTranslator } from "next-intl";
import { and, gte, lte, sql } from "drizzle-orm";
import { Document, Page, StyleSheet, View } from "@react-pdf/renderer";
import { getDb, withSession } from "@/db/client";
import { cashflows, ledgerEntries, statements } from "@/db/schema";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import { getPortfolio } from "./access";
import { getFinance } from "./finance";
import { portfolioMetrics } from "./metrics";
import { appendAudit } from "./audit";
import { can } from "./permissions";
import { canonical } from "./hash";
import { DEMO_TODAY, SAMPLE_FX_EGP_PER_USD } from "./assumptions";
import { dateFmt, money, pct } from "./format";
import { quarterMonths } from "./finance-calc";
import { registerFonts, PdfText as Text, setPdfMixed, PDF_COLORS as C } from "./pack/document";
import type { CurrentUser } from "./session";

/**
 * Investor statements: a PDF for a year to date or a closed quarter. It shows only what an investor may see: the
 * portfolio's value against cost, the portfolio's net operating income in aggregate (never a single asset's income or
 * rent), the distributions paid in the period and the holdings. Each statement is recorded with its content hash.
 */
export const STATEMENT_PERIODS = ["2026", "2026-Q1", "2026-Q2", "2026-Q3"] as const;
export type StatementPeriod = (typeof STATEMENT_PERIODS)[number];
type Lang = "en" | "ar";

export const periodMonths = (p: StatementPeriod) => (p.includes("Q") ? quarterMonths(p) : Array.from({ length: 10 }, (_, i) => `${p}-${String(i + 1).padStart(2, "0")}-01`));
const periodRange = (p: StatementPeriod) => { const m = periodMonths(p); const last = new Date(`${m[m.length - 1]}T00:00:00Z`); return { from: m[0], to: new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0)).toISOString().slice(0, 10) }; };

export interface StatementModel {
  period: StatementPeriod; from: string; to: string; asOf: string; lang: Lang; investor: string;
  portfolio: { count: number; value: number; cost: number; gain: number; gainPct: number; incomeUnits: number };
  noi: { income: number; costs: number; net: number };
  distributions: { id: string; period: string; amount: number; paidOn: string }[];
  holdings: { id: string; name: string; district: string; value: number }[];
}

/** Portfolio-level income and costs for the period, aggregated on the privileged connection (no per-asset figures). */
async function aggregateNoi(from: string, to: string) {
  const db = await getDb();
  const [c] = await db.select({ inc: sql<number>`coalesce(sum(case when ${cashflows.amountEgp} > 0 then ${cashflows.amountEgp} else 0 end),0)::float8`, cost: sql<number>`coalesce(sum(case when ${cashflows.amountEgp} < 0 then ${cashflows.amountEgp} else 0 end),0)::float8` })
    .from(cashflows).where(and(gte(cashflows.month, from), lte(cashflows.month, to)));
  const [l] = await db.select({ inc: sql<number>`coalesce(sum(case when ${ledgerEntries.amountEgp} > 0 then ${ledgerEntries.amountEgp} else 0 end),0)::float8`, cost: sql<number>`coalesce(sum(case when ${ledgerEntries.amountEgp} < 0 then ${ledgerEntries.amountEgp} else 0 end),0)::float8` })
    .from(ledgerEntries).where(and(gte(ledgerEntries.entryDate, from), lte(ledgerEntries.entryDate, to)));
  const income = c.inc + l.inc, costs = c.cost + l.cost;
  return { income, costs, net: income + costs };
}

export async function buildStatement(user: CurrentUser, period: StatementPeriod, lang: Lang): Promise<StatementModel | null> {
  if (!can(user.role, "portfolio.view")) return null;
  const { from, to } = periodRange(period);
  const rows = await getPortfolio(user);
  const m = portfolioMetrics(rows);
  const f = await getFinance(user);
  const paid = (f?.distributions ?? []).filter((d) => d.status === "paid" && d.paidOn && d.paidOn >= from && d.paidOn <= (to > DEMO_TODAY ? DEMO_TODAY : to));
  return {
    period, from, to: to > DEMO_TODAY ? DEMO_TODAY : to, asOf: DEMO_TODAY, lang, investor: lang === "ar" ? "مكتب عائلي تجريبي" : "Sample Family Office",
    portfolio: { count: m.count, value: m.value, cost: m.cost, gain: m.gain, gainPct: m.gainPct, incomeUnits: m.incomeUnits },
    noi: await aggregateNoi(from, to),
    distributions: paid.map((d) => ({ id: d.id, period: d.period, amount: d.amountEgp, paidOn: d.paidOn! })),
    holdings: [...rows].sort((a, b) => b.valueEgp - a.valueEgp).map((r) => ({ id: r.id, name: lang === "ar" ? r.nameAr : r.name, district: lang === "ar" ? r.district.nameAr : r.district.name, value: r.valueEgp })),
  };
}

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9.5, color: C.ink, backgroundColor: C.bg },
  h1: { fontFamily: "Playfair", fontSize: 22, marginBottom: 4 },
  h2: { fontFamily: "Playfair", fontSize: 13, marginTop: 18, marginBottom: 6 },
  muted: { color: C.muted },
  row: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 4 },
  kpis: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
  kpi: { width: "33%", paddingVertical: 6 },
  kpiValue: { fontFamily: "Playfair", fontSize: 14, marginTop: 2 },
  note: { marginTop: 18, fontSize: 8, color: C.muted },
});

function StatementDocument({ m, t }: { m: StatementModel; t: (k: string, p?: Record<string, string | number>) => string }) {
  const ar = m.lang === "ar";
  setPdfMixed(ar);
  const base = { fontFamily: ar ? "Plex" : "Manrope", textAlign: ar ? "right" : "left" } as const;
  const row = { ...s.row, flexDirection: ar ? "row-reverse" : "row" } as const;
  const M = (n: number) => money(n, "EGP", m.lang, { fx: SAMPLE_FX_EGP_PER_USD });
  const kpi = (label: string, value: string) => <View style={s.kpi}><Text style={[base, s.muted]}>{label}</Text><Text style={[base, s.kpiValue, ar ? { fontFamily: "Naskh" } : {}]}>{value}</Text></View>;
  return (
    <Document title={t("pdfTitle", { period: m.period })} author="ZMNHOOF OS" language={m.lang}>
      <Page size="A4" style={[s.page, base]}>
        <Text style={[base, s.muted]}>ZMNHOOF OS</Text>
        <Text style={[base, s.h1, ar ? { fontFamily: "Naskh" } : {}]}>{t("pdfTitle", { period: m.period })}</Text>
        <Text style={[base, s.muted]}>{t("pdfFor", { investor: m.investor, from: dateFmt(m.from, m.lang), to: dateFmt(m.to, m.lang) })}</Text>
        <View style={[s.kpis, ar ? { flexDirection: "row-reverse" } : {}]}>
          {kpi(t("pdfValue"), M(m.portfolio.value))}
          {kpi(t("pdfCost"), M(m.portfolio.cost))}
          {kpi(t("pdfGain"), `${M(m.portfolio.gain)} (${pct(m.portfolio.gainPct, m.lang)})`)}
          {kpi(t("pdfNoi"), M(m.noi.net))}
          {kpi(t("pdfDistributed"), M(m.distributions.reduce((x, d) => x + d.amount, 0)))}
          {kpi(t("pdfAssets"), t("pdfAssetsValue", { n: m.portfolio.count, units: m.portfolio.incomeUnits }))}
        </View>
        <Text style={[base, s.h2, ar ? { fontFamily: "Naskh" } : {}]}>{t("pdfDistTitle")}</Text>
        {m.distributions.length === 0 ? <Text style={[base, s.muted]}>{t("pdfNoDist")}</Text> : m.distributions.map((d) => (
          <View key={d.id} style={row}><Text style={base}>{`${d.id}  ${d.period}`}</Text><Text style={base}>{dateFmt(d.paidOn, m.lang)}</Text><Text style={base}>{M(d.amount)}</Text></View>
        ))}
        <Text style={[base, s.h2, ar ? { fontFamily: "Naskh" } : {}]}>{t("pdfIncomeTitle")}</Text>
        <View style={row}><Text style={base}>{t("pdfIncome")}</Text><Text style={base}>{M(m.noi.income)}</Text></View>
        <View style={row}><Text style={base}>{t("pdfCosts")}</Text><Text style={base}>{M(-m.noi.costs)}</Text></View>
        <View style={row}><Text style={[base, { fontWeight: 600 }]}>{t("pdfNoi")}</Text><Text style={[base, { fontWeight: 600 }]}>{M(m.noi.net)}</Text></View>
        <Text style={[base, s.muted, { marginTop: 4, fontSize: 8 }]}>{t("pdfAggregateNote")}</Text>
        <Text style={[base, s.h2, ar ? { fontFamily: "Naskh" } : {}]}>{t("pdfHoldings")}</Text>
        {m.holdings.map((h) => (
          <View key={h.id} style={row} wrap={false}><Text style={base}>{`${h.id}  ${h.name}`}</Text><Text style={[base, s.muted]}>{h.district}</Text><Text style={base}>{M(h.value)}</Text></View>
        ))}
        <Text style={[base, s.note]}>{t("pdfFooter", { date: dateFmt(m.asOf, m.lang) })}</Text>
      </Page>
    </Document>
  );
}

const tr = (lang: Lang) => {
  const t = createTranslator({ locale: lang, messages: (lang === "ar" ? ar : en) as never, namespace: "rep" as never }) as unknown as (k: string, p?: Record<string, string | number>) => string;
  return (k: string, p?: Record<string, string | number>) => t(k, p);
};

/** Render a statement to PDF and record it. Returns the bytes, its id and content hash. */
export async function generateStatement(user: CurrentUser, period: StatementPeriod, lang: Lang) {
  const m = await buildStatement(user, period, lang);
  if (!m) return { ok: false as const, error: "forbidden" as const };
  registerFonts();
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const buffer = await renderToBuffer(React.createElement(StatementDocument, { m, t: tr(lang) }) as never);
  const contentHash = createHash("sha256").update(canonical(m)).digest("hex");
  const id = await withSession({ userId: user.id, role: user.role }, async (tx) => {
    const n = (await tx.select({ id: statements.id }).from(statements)).length + 1;
    const sid = `ST-${String(n).padStart(4, "0")}`;
    await tx.insert(statements).values({ id: sid, period, lang, generatedBy: user.id, contentHash, at: new Date() });
    return sid;
  });
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "statement.generate", entity: "statement", entityId: id, detail: { period, lang, contentHash } });
  return { ok: true as const, id, buffer, contentHash, model: m };
}
