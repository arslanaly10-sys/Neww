import path from "node:path";
import React from "react";
import { Document, Font, Page, Polyline, StyleSheet, Svg, Text as RText, View, Line } from "@react-pdf/renderer";
import { dateFmt, int, money, pct } from "../format";
import type { PackModel } from "./model";

export type Tr = (key: string, params?: Record<string, string | number>) => string;
const F = (f: string) => path.join(process.cwd(), "assets/fonts", f);
let registered = false;
function registerFonts() {
  if (registered) return;
  Font.register({ family: "Manrope", fonts: [{ src: F("Manrope-400.woff") }, { src: F("Manrope-600.woff"), fontWeight: 600 }, { src: F("Manrope-700.woff"), fontWeight: 700 }] });
  Font.register({ family: "Playfair", fonts: [{ src: F("PlayfairDisplay-400.woff") }, { src: F("PlayfairDisplay-600.woff"), fontWeight: 600 }] });
  Font.register({ family: "Plex", fonts: [{ src: F("IBMPlexSansArabic-400.woff") }, { src: F("IBMPlexSansArabic-600.woff"), fontWeight: 600 }] });
  Font.register({ family: "Naskh", fonts: [{ src: F("NotoNaskhArabic-400.woff") }, { src: F("NotoNaskhArabic-600.woff"), fontWeight: 600 }] });
  Font.registerHyphenationCallback((w) => [w]);
  registered = true;
}

const ARABIC_PHRASE = /([\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+(?:[ \u060C\u061B\u061F]+[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+)*)/;

/**
 * The Arabic font files are subsets with no Latin letters, digits or punctuation. In Arabic documents, text with no Arabic
 * letters at all (ids, hashes, plain numbers) is set in Manrope. Sentences that mix Arabic with digits stay in one run:
 * react-pdf's bidirectional ordering breaks when a sentence is split across fonts.
 */
function Text({ children, style, ...p }: React.ComponentProps<typeof RText> & { children?: React.ReactNode }) {
  const parts = React.Children.toArray(children);
  const plain = parts.length > 0 && parts.every((c) => typeof c === "string" || typeof c === "number");
  const latinOnly = MIXED.current && plain && !ARABIC_PHRASE.test(parts.join(""));
  return <RText {...p} style={(latinOnly ? [style, { fontFamily: "Manrope" }] : style) as never}>{children}</RText>;
}
const MIXED = { current: false };

const C = { bg: "#ffffff", ink: "#14120e", muted: "#5b564a", gold: "#8a6a22", goldFill: "#c9a45c", teal: "#1d6560", line: "#d8cfba", soft: "#f6f2e9", danger: "#a3392a", ok: "#2f6b3a" };

interface Props { m: PackModel; t: Tr; ta: Tr; ty: Tr; hashes: { content: string; verification: string } }

export function PackDocument({ m, t, ta, ty, hashes }: Props) {
  registerFonts();
  const ar = m.lang === "ar";
  MIXED.current = ar;
  const loc = m.lang;
  const body = ar ? "Plex" : "Manrope";
  const display = ar ? "Naskh" : "Playfair";
  const s = StyleSheet.create({
    page: { fontFamily: body, fontSize: 10, color: C.ink, paddingTop: 48, paddingBottom: 54, paddingHorizontal: 48, lineHeight: 1.45, backgroundColor: C.bg },
    h1: { fontFamily: display, fontSize: 24, fontWeight: 600, color: C.ink, textAlign: ar ? "right" : "left", marginBottom: 10, lineHeight: 1.5 },
    lead: { color: C.muted, marginBottom: 16, textAlign: ar ? "right" : "left", lineHeight: 1.5 },
    h2: { fontFamily: display, fontSize: 14, fontWeight: 600, marginTop: 16, marginBottom: 8, textAlign: ar ? "right" : "left", lineHeight: 1.5 },
    row: { flexDirection: ar ? "row-reverse" : "row", alignItems: "center" },
    cell: { textAlign: ar ? "right" : "left" },
    muted: { color: C.muted, textAlign: ar ? "right" : "left" },
    foot: { position: "absolute", bottom: 22, left: 48, right: 48, flexDirection: ar ? "row-reverse" : "row", justifyContent: "space-between", fontSize: 8, color: C.muted, borderTop: `0.5pt solid ${C.line}`, paddingTop: 5 },
  });
  const pctS = (x: number) => (ar ? `${(x * 100).toFixed(1)} في المئة` : pct(x, loc));
  const money$ = (egp: number, compact = false) => money(egp, m.currency, loc, { fx: m.fx, compact });
  const cols = <T,>(a: T[]) => (ar ? [...a].reverse() : a);
  const Table = ({ head, rows, widths }: { head: string[]; rows: (string | React.ReactElement)[][]; widths: number[] }) => (
    <View>
      <View style={[s.row, { backgroundColor: C.soft, paddingVertical: 4 }]}>
        {cols(head).map((h, i) => <Text key={i} style={[s.cell, { width: `${cols(widths)[i]}%`, fontWeight: 600, fontSize: 8, color: C.muted, paddingHorizontal: 3 }]}>{h}</Text>)}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={[s.row, { borderBottom: `0.5pt solid ${C.line}`, paddingVertical: 4 }]} wrap={false}>
          {cols(r).map((c, i) => <View key={i} style={{ width: `${cols(widths)[i]}%`, paddingHorizontal: 3 }}>{typeof c === "string" ? <Text style={s.cell}>{c}</Text> : c}</View>)}
        </View>
      ))}
    </View>
  );
  const TOTAL = 7;
  const Footer = ({ n }: { n: number }) => (
    <>
      <Text style={{ position: "absolute", bottom: 22, [ar ? "right" : "left"]: 48, fontSize: 8, color: C.muted }}>{t("footer")}</Text>
      <Text style={{ position: "absolute", bottom: 22, [ar ? "left" : "right"]: 48, fontSize: 8, color: C.muted }}>{`${n} / ${TOTAL}`}</Text>
    </>
  );
  const Bars = ({ items }: { items: { label: string; share: number }[] }) => (
    <View>
      {items.map((it, i) => (
        <View key={i} style={{ marginBottom: 5 }} wrap={false}>
          <View style={[s.row, { justifyContent: "space-between", marginBottom: 2 }]}><Text>{it.label}</Text><Text style={{ color: C.muted }}>{pct(it.share, loc)}</Text></View>
          <View style={{ height: 5, backgroundColor: C.soft, flexDirection: ar ? "row-reverse" : "row" }}><View style={{ height: 5, width: `${Math.max(2, (it.share / Math.max(...items.map((x) => x.share))) * 100)}%`, backgroundColor: C.goldFill }} /></View>
        </View>
      ))}
    </View>
  );

  // Chart: value and cost over 36 months. Time runs left to right in both languages.
  const W = 500, H = 150, pad = 6;
  const vs = m.performance.months.map((x) => x.value), cs = m.performance.months.map((x) => x.cost);
  const lo = Math.min(...vs.filter(Boolean), ...cs) * 0.95, hi = Math.max(...vs, ...cs) * 1.03;
  const pts = (a: number[]) => a.map((v, i) => `${(pad + (i / (a.length - 1)) * (W - pad * 2)).toFixed(1)},${(H - pad - ((v - lo) / (hi - lo)) * (H - pad * 2)).toFixed(1)}`).join(" ");
  const sum = m.summary;
  const shortHash = hashes.verification.slice(0, 16);
  const bandColor = (b: string) => (b === "low" ? C.ok : b === "medium" ? C.gold : C.danger);

  return (
    <Document title={`${t("coverTitle")} · ZMNHOOF OS`} author="ZMNHOOF OS concept demo" subject="Sample data" language={m.lang}>
      {/* 1 Cover */}
      <Page size="A4" style={s.page}>
        <View style={{ marginTop: 120 }}>
          <Text style={{ fontFamily: "Playfair", fontSize: 12, letterSpacing: 3, color: C.gold, textAlign: ar ? "right" : "left" }}>ZMNHOOF OS</Text>
          <Text style={{ fontFamily: display, fontSize: 38, fontWeight: 600, marginTop: 14, lineHeight: 1.6, textAlign: ar ? "right" : "left" }}>{t("coverTitle")}</Text>
          <Text style={{ fontSize: 13, color: C.muted, marginTop: 14, textAlign: ar ? "right" : "left" }}>{t("coverSub", { holder: m.holder })}</Text>
          <Text style={{ marginTop: 28, textAlign: ar ? "right" : "left" }}>{t("asOf", { date: dateFmt(m.asOf, loc) })}</Text>
          <Text style={{ color: C.muted, textAlign: ar ? "right" : "left" }}>{t("preparedFor", { role: t(`role_${m.role}`) })}</Text>
          <Text style={{ color: C.muted, textAlign: ar ? "right" : "left" }}>{t("currencyLine", { cur: m.currency, rate: m.fx })}</Text>
        </View>
        <View style={{ marginTop: 56, padding: 12, borderLeft: ar ? undefined : `2pt solid ${C.goldFill}`, borderRight: ar ? `2pt solid ${C.goldFill}` : undefined, backgroundColor: C.soft }}>
          <Text style={{ fontWeight: 600, marginBottom: 3, textAlign: ar ? "right" : "left" }}>{t("sampleHead")}</Text>
          <Text style={{ color: C.muted, textAlign: ar ? "right" : "left" }}>{t("sampleBox")}</Text>
        </View>
        <Text style={{ position: "absolute", bottom: 70, left: 48, right: 48, color: C.gold, fontFamily: display, fontSize: 12, textAlign: ar ? "right" : "left" }}>{t("triad")}  ·  {t("aiLine")}</Text>
        <Text style={{ position: "absolute", bottom: 50, left: 48, right: 48, fontSize: 7, color: C.muted, textAlign: ar ? "right" : "left" }}>{t("verification")}: {shortHash}…</Text>
        <Footer n={1} />
      </Page>

      {/* 2 Summary */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{t("summaryTitle")}</Text>
        <Text style={s.lead}>{t("summaryLead")}</Text>
        <View style={[s.row, { flexWrap: "wrap", gap: 8 }]}>
          {([[t("kpiValue"), money$(sum.valueEgp, true)], [t("kpiCost"), money$(sum.costEgp, true)], [t("kpiGain"), money$(sum.gainEgp, true), `+${pct(sum.gainPct, loc)}`], [t("kpiYield"), pct(sum.netYieldPct, loc)], [t("kpiUnits"), `${int(sum.incomeUnits, loc)} / ${int(sum.assets, loc)}`], [t("kpiVacant"), int(sum.vacant, loc)]] as string[][]).map(([k, v, sub], i) => (
            <View key={i} style={{ width: "31.5%", padding: 9, border: `0.5pt solid ${C.line}`, backgroundColor: C.soft }}>
              <Text style={{ fontSize: 7.5, color: C.muted, textAlign: ar ? "right" : "left" }}>{k}</Text>
              <Text style={{ fontFamily: display, fontSize: 15, marginTop: 3, lineHeight: 1.5, textAlign: ar ? "right" : "left" }}>{v}</Text>
              {sub ? <Text style={{ fontSize: 8, color: C.muted, textAlign: ar ? "right" : "left" }}>{sub}</Text> : null}
            </View>
          ))}
        </View>
        <Text style={s.h2}>{t("narrativeTitle")}</Text>
        <Text style={{ textAlign: ar ? "right" : "left" }}>{t("narrative", { date: dateFmt(m.asOf, loc), count: int(sum.assets, loc), value: money$(sum.valueEgp, true), gain: money$(sum.gainEgp, true), units: int(sum.incomeUnits, loc), yield: pctS(sum.netYieldPct), vacant: int(sum.vacant, loc) })}</Text>
        <Text style={[s.muted, { marginTop: 8 }]}>{t("yieldNote")}</Text>
        <Footer n={2} />
      </Page>

      {/* 3 Performance */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{t("perfTitle")}</Text>
        <Text style={s.lead}>{t("perfLead", { change: pctS(m.performance.changePct) })}</Text>
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ marginTop: 6 }}>
          {[0.25, 0.5, 0.75].map((g) => <Line key={g} x1={0} x2={W} y1={H * g} y2={H * g} stroke={C.line} strokeWidth={0.5} strokeDasharray="2 3" />)}
          <Polyline points={pts(cs)} stroke={C.teal} strokeWidth={1.4} strokeDasharray="4 3" fill="none" />
          <Polyline points={pts(vs)} stroke={C.gold} strokeWidth={2} fill="none" />
        </Svg>
        <View style={[s.row, { justifyContent: "space-between", marginTop: 3 }]}><Text style={{ fontSize: 8, color: C.muted }}>{dateFmt(m.performance.months[0].month, loc)}</Text><Text style={{ fontSize: 8, color: C.muted }}>{dateFmt(m.performance.months[m.performance.months.length - 1].month, loc)}</Text></View>
        <View style={[s.row, { gap: 14, marginTop: 6 }]}><Text style={{ color: C.gold }}>— {t("valueLabel")}</Text><Text style={{ color: C.teal }}>- - {t("costLabel")}</Text></View>
        <Text style={s.h2}>{t("perfTable")}</Text>
        <Table head={[t("colMonth"), t("valueLabel"), t("costLabel")]} widths={[34, 33, 33]}
          rows={[m.performance.months[0], m.performance.months[11], m.performance.months[23], m.performance.months[m.performance.months.length - 1]].map((x) => [dateFmt(x.month, loc), money$(x.value, true), money$(x.cost, true)])} />
        <Text style={[s.muted, { marginTop: 10 }]}>{t("perfNote")}</Text>
        <Footer n={3} />
      </Page>

      {/* 4 Allocation */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{t("allocTitle")}</Text>
        <Text style={s.lead}>{t("allocLead")}</Text>
        <Text style={s.h2}>{t("byType")}</Text>
        <Bars items={m.allocation.byType.map((x) => ({ label: ty(x.id), share: x.share }))} />
        <Text style={s.h2}>{t("byDistrict")}</Text>
        <Bars items={m.allocation.byDistrict.map((x) => ({ label: ar ? x.nameAr : x.name, share: x.share }))} />
        <Footer n={4} />
      </Page>

      {/* 5 Risks */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{t("riskTitle")}</Text>
        <Text style={s.lead}>{t("riskLead")}</Text>
        <Table head={[t("colAsset"), t("colValue"), t("colScore"), t("colWhy")]} widths={[28, 16, 14, 42]}
          rows={m.risks.map((r) => [
            `${ar ? r.nameAr : r.name} (${r.id})`, money$(r.valueEgp, true),
            <Text key="s" style={[s.cell, { color: bandColor(r.band), fontWeight: 600 }]}>{r.score}/100 – {ta(`band_${r.band}`)}</Text>,
            r.top.map((d) => `${ta(`driver_${d.key}`)}: ${ta(`r_${d.reason.id}`, d.reason.params)}`).join("; "),
          ])} />
        <Text style={[s.muted, { marginTop: 10 }]}>{t("riskNote")}</Text>
        <Footer n={5} />
      </Page>

      {/* 6 Valuation changes */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{t("valTitle")}</Text>
        <Text style={s.lead}>{t("valLead")}</Text>
        {m.valuations.length === 0 ? <Text style={s.muted}>{t("none")}</Text> : (
          <Table head={[t("colAsset"), t("colDate"), t("colModel"), t("colFinal"), t("colAdj")]} widths={[30, 15, 20, 20, 15]}
            rows={m.valuations.map((v) => [`${ar ? v.assetAr : v.asset} (${v.id})`, dateFmt(v.on, loc), money$(v.modelEstimateEgp, true), money$(v.finalValueEgp ?? v.modelEstimateEgp, true), pct(v.adjustmentPct, loc)])} />
        )}
        <Text style={[s.muted, { marginTop: 10 }]}>{t("valPending", { n: m.pendingValuations })}</Text>
        <Footer n={6} />
      </Page>

      {/* 7 Audit appendix */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{t("auditTitle")}</Text>
        <Text style={s.lead}>{t("auditLead")}</Text>
        <Table head={[t("colSeq"), t("colDate"), t("colAction"), t("colRecord"), t("colHash")]} widths={[9, 16, 27, 20, 28]}
          rows={m.audit.excerpt.map((e) => [String(e.seq), dateFmt(e.at, loc), e.action, e.entityId, `${e.hash}…`])} />
        <Text style={s.h2}>{t("chainTitle")}</Text>
        <Text style={s.cell}>{t("chainEvents")}: {int(m.audit.events, loc)}</Text>
        <Text style={s.cell}>{t("chainHead")}: {m.audit.headSeq}</Text>
        <View style={{ marginTop: 6 }}><Text style={{ fontSize: 7.5, color: C.muted, textAlign: ar ? "right" : "left" }}>{t("chainHeadHash")}</Text><Text style={{ fontFamily: "Manrope", fontSize: 7.5, textAlign: "left" }}>{m.audit.headHash}</Text></View>
        <Text style={s.h2}>{t("hashTitle")}</Text>
        <View style={{ marginTop: 2 }}><Text style={{ fontSize: 7.5, color: C.muted, textAlign: ar ? "right" : "left" }}>{t("contentHash")}</Text><Text style={{ fontFamily: "Manrope", fontSize: 7.5, textAlign: "left" }}>{hashes.content}</Text></View>
        <View style={{ marginTop: 6 }}><Text style={{ fontSize: 7.5, color: C.muted, textAlign: ar ? "right" : "left" }}>{t("verification")}</Text><Text style={{ fontFamily: "Manrope", fontSize: 8.5, fontWeight: 700, textAlign: "left" }}>{hashes.verification}</Text></View>
        <Text style={[s.muted, { marginTop: 12 }]}>{t("verifyHow")}</Text>
        <Footer n={7} />
      </Page>
    </Document>
  );
}
