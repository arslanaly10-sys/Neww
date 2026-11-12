import { normaliseDigits } from "../horus/validate";

/**
 * Sample extraction: a deterministic, rule-based reader for the three bundled sample documents.
 * It reads the PDF text layer, matches labels fuzzily (Arabic text comes out of PDFs with some garbled letters, so exact
 * matching is not enough), parses values by type, and reports a confidence and the source line for every field.
 * It is not a general document reader and does not use a model.
 */
export const ENGINE = "sample-rules-1.0";
export type DocKind = "lease" | "deed";
export type FieldKey =
  | "reference" | "landlord" | "tenant" | "premises" | "areaSqm" | "startDate" | "endDate" | "monthlyRent" | "indexationPct" | "depositMonths"
  | "clause.break" | "clause.renewal" | "clause.sublet" | "clause.governingLaw"
  | "registryNo" | "owner" | "unit" | "registeredOn";
export type FieldType = "text" | "date" | "money" | "number" | "percent" | "months" | "clause";

export interface ExtractedField {
  key: FieldKey; type: FieldType; value: string | number; currency?: string;
  confidence: number; snippet: string; page: number; langs: ("en" | "ar")[];
  conflict?: { en: string | number; ar: string | number };
}

const DEFS: Record<DocKind, { key: FieldKey; type: FieldType; en: string[]; ar: string[] }[]> = {
  lease: [
    { key: "reference", type: "text", en: ["Lease reference"], ar: ["رقم العقد"] },
    { key: "landlord", type: "text", en: ["Landlord"], ar: ["المؤجر"] },
    { key: "tenant", type: "text", en: ["Tenant"], ar: ["المستأجر"] },
    { key: "premises", type: "text", en: ["Premises"], ar: ["العقار"] },
    { key: "areaSqm", type: "number", en: ["Area"], ar: ["المساحة"] },
    { key: "startDate", type: "date", en: ["Lease start date"], ar: ["تاريخ بدء الإيجار"] },
    { key: "endDate", type: "date", en: ["Lease end date"], ar: ["تاريخ انتهاء الإيجار"] },
    { key: "monthlyRent", type: "money", en: ["Monthly rent"], ar: ["الإيجار الشهري"] },
    { key: "indexationPct", type: "percent", en: ["Annual indexation"], ar: ["الزيادة السنوية"] },
    { key: "depositMonths", type: "months", en: ["Security deposit"], ar: ["مبلغ التأمين"] },
  ],
  deed: [
    { key: "registryNo", type: "text", en: ["Registry number"], ar: ["رقم التسجيل"] },
    { key: "owner", type: "text", en: ["Owner"], ar: ["المالك"] },
    { key: "unit", type: "text", en: ["Unit"], ar: ["الوحدة"] },
    { key: "areaSqm", type: "number", en: ["Area"], ar: ["المساحة"] },
    { key: "registeredOn", type: "date", en: ["Registration date"], ar: ["تاريخ التسجيل"] },
  ],
};

const isAr = (s: string) => /[؀-ۿ]/.test(s);
const norm = (s: string) => s.toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
function bigrams(s: string) { const t = norm(s).replace(/ /g, ""); const out: string[] = []; for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2)); return out; }
/** Dice coefficient on character bigrams: tolerant of a dropped or substituted letter. */
export function similarity(a: string, b: string) {
  if (norm(a) === norm(b)) return 1;
  const x = bigrams(a), y = bigrams(b);
  if (!x.length || !y.length) return 0;
  const m = new Map<string, number>();
  for (const g of x) m.set(g, (m.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of y) { const n = m.get(g); if (n) { hit++; m.set(g, n - 1); } }
  return (2 * hit) / (x.length + y.length);
}
const hasWord = (line: string, word: string, min = 0.62) => norm(line).split(/[\s.,،؛:]+/).some((t) => t && similarity(t, word) >= min);

const MONTHS: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const iso = (y: number, m: number, d: number) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function parseValue(type: FieldType, raw: string): { value: string | number; currency?: string; conf: number } | null {
  const text = normaliseDigits(raw).trim();
  switch (type) {
    case "text": return text ? { value: text.replace(/\s+/g, " "), conf: 1 } : null;
    case "date": {
      let m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
      if (m && MONTHS[m[2].toLowerCase()]) return { value: iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]), conf: 1 };
      m = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
      if (m) return { value: iso(+m[1], +m[2], +m[3]), conf: 1 };
      return null;
    }
    case "money": {
      // Garbled Arabic can leave a stray digit next to the currency word ("جني1"), so take the longest numeric token.
      const nums = text.match(/\d{1,3}(?:,\d{3})+|\d+/g);
      if (!nums) return null;
      const m = [nums.sort((a, b) => b.replace(/,/g, "").length - a.replace(/,/g, "").length)[0]];
      const usd = /USD|\$|دولار|دولا/i.test(text);
      const egp = /EGP|جني|جنيه/i.test(text);
      return { value: Number(m[0].replace(/,/g, "")), currency: usd ? "USD" : egp ? "EGP" : undefined, conf: usd || egp ? 1 : 0.7 };
    }
    case "number": case "percent": case "months": {
      const m = text.match(/\d+(?:\.\d+)?/);
      return m ? { value: Number(m[0]), conf: 1 } : null;
    }
    default: return null;
  }
}

interface Line { text: string; page: number }
const toLines = (pages: string[]): Line[] => pages.flatMap((p, i) => p.split("\n").map((t) => ({ text: t.replace(/­/g, "").trim(), page: i + 1 })).filter((l) => l.text));

/** Clause rules. Arabic words are matched fuzzily; each rule returns a code or null. */
function clauseCode(key: FieldKey, text: string, ar: boolean): string | null {
  const t = normaliseDigits(text);
  switch (key) {
    case "clause.break":
      if (/no (right|early)|without (a )?break/i.test(t) || hasWord(t, "لايوجد")) return "none";
      if (/terminate early|break/i.test(t) || hasWord(t, "إنهاء")) return /\b90\b/.test(t) ? "after12m90d" : null;
      return null;
    case "clause.renewal":
      if (/first right/i.test(t) || hasWord(t, "أولوية")) return "tenantFirstRight";
      if (/mutual/i.test(t) || hasWord(t, "اتفاق") || hasWord(t, "بالاتفاق")) return "mutual";
      return null;
    case "clause.sublet":
      if ((/sublet/i.test(t) && /consent/i.test(t)) || (hasWord(t, "الباطن") && hasWord(t, "موافقة"))) return "consentRequired";
      return null;
    case "clause.governingLaw":
      if (/egypt/i.test(t) || hasWord(t, "المصري") || hasWord(t, "القاهرة")) return "egypt";
      return null;
  }
  void ar;
  return null;
}
const CLAUSE_HEADS: { key: FieldKey; en: RegExp; ar: string[] }[] = [
  { key: "clause.break", en: /early termination/i, ar: ["الإنهاء", "المبكر"] },
  { key: "clause.renewal", en: /^\d+\.\s*renewal/i, ar: ["التجديد"] },
  { key: "clause.sublet", en: /subletting/i, ar: ["الباطن"] },
  { key: "clause.governingLaw", en: /governing law/i, ar: ["الواجب", "التطبيق"] },
];

export function parseLines(pages: string[], kind: DocKind): ExtractedField[] {
  const lines = toLines(pages);
  const found = new Map<string, ExtractedField[]>();
  const add = (f: ExtractedField) => found.set(f.key, [...(found.get(f.key) ?? []), f]);

  // 1. Labelled fields: "Label: value", or the reverse when Arabic text is extracted in visual order.
  for (const l of lines) {
    const ci = l.text.indexOf(":");
    if (ci < 0) continue;
    const parts = [l.text.slice(0, ci), l.text.slice(ci + 1)];
    let best: { def: (typeof DEFS)[DocKind][number]; sim: number; margin: number; value: string; lang: "en" | "ar" } | null = null;
    for (const [labelPart, valuePart] of [[parts[0], parts[1]], [parts[1], parts[0]]]) {
      const lang: "en" | "ar" = isAr(labelPart) ? "ar" : "en";
      const scored = DEFS[kind].map((d) => ({ d, s: Math.max(...(lang === "ar" ? d.ar : d.en).map((x) => similarity(labelPart, x))) })).sort((a, b) => b.s - a.s);
      if (scored[0] && scored[0].s >= 0.62 && (!best || scored[0].s > best.sim)) best = { def: scored[0].d, sim: scored[0].s, margin: scored[0].s - (scored[1]?.s ?? 0), value: valuePart, lang };
    }
    if (!best) continue;
    const v = parseValue(best.def.type, best.value);
    if (!v) continue;
    const conf = Math.min(1, best.sim * (best.margin >= 0.1 ? 1 : 0.85) * v.conf);
    add({ key: best.def.key, type: best.def.type, value: v.value, currency: v.currency, confidence: Math.round(conf * 100) / 100, snippet: l.text, page: l.page, langs: [best.lang] });
  }

  // 2. Numbered clauses. Wrapped lines are joined to the clause above.
  if (kind === "lease") {
    const clauses: Line[] = [];
    for (const l of lines) {
      if (/^\d+\./.test(l.text)) clauses.push({ ...l });
      else if (clauses.length && !l.text.includes(":") && !/^(Terms|البنود|Signed|ZMNHOOF)/.test(l.text) && !/^SAMPLE|^مستند/.test(l.text) && !isAr(l.text) === !isAr(clauses[clauses.length - 1].text)) clauses[clauses.length - 1].text += " " + l.text;
    }
    for (const c of clauses) {
      const ar = isAr(c.text);
      const head = CLAUSE_HEADS.find((h) => (ar ? h.ar.every((w) => hasWord(c.text, w)) : h.en.test(c.text)));
      if (!head) continue;
      const code = clauseCode(head.key, c.text, ar);
      add({ key: head.key, type: "clause", value: code ?? "unrecognised", confidence: code ? (ar ? 0.85 : 0.95) : 0.4, snippet: c.text, page: c.page, langs: [ar ? "ar" : "en"] });
    }
  }

  // 3. Merge English and Arabic readings of the same field. Agreement raises confidence; disagreement is a conflict.
  const out: ExtractedField[] = [];
  for (const d of DEFS[kind]) {
    const keys: FieldKey[] = [d.key];
    for (const k of keys) { const c = found.get(k); if (c) out.push(merge(c)); }
  }
  if (kind === "lease") for (const k of ["clause.break", "clause.renewal", "clause.sublet", "clause.governingLaw"] as FieldKey[]) { const c = found.get(k); if (c) out.push(merge(c)); }
  return out;
}

function merge(c: ExtractedField[]): ExtractedField {
  const en = c.find((x) => x.langs[0] === "en"), ar = c.find((x) => x.langs[0] === "ar");
  if (en && ar) {
    const same = String(en.value).toLowerCase() === String(ar.value).toLowerCase();
    if (en.type === "text") return { ...en, langs: ["en", "ar"] }; // names and addresses are Latin in both halves; the English reading is the source
    if (same) return { ...en, confidence: Math.min(0.99, Math.round((1 - (1 - en.confidence) * (1 - ar.confidence)) * 100) / 100), langs: ["en", "ar"], snippet: `${en.snippet}  |  ${ar.snippet}` };
    return { ...en, confidence: Math.round(Math.min(en.confidence, ar.confidence) * 0.6 * 100) / 100, langs: ["en", "ar"], conflict: { en: en.value, ar: ar.value }, snippet: `${en.snippet}  |  ${ar.snippet}` };
  }
  return c[0];
}

export const needsCheck = (f: Pick<ExtractedField, "confidence" | "conflict">) => f.confidence < 0.9 || !!f.conflict;

export async function extractFromBytes(bytes: Uint8Array, kind: DocKind) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  const hasEn = pages.some((p) => /[A-Za-z]{4}/.test(p) && /Lease|Landlord|Owner/.test(p)), hasAr = pages.some((p) => isAr(p));
  return { engine: ENGINE, pageCount: totalPages, language: hasEn && hasAr ? "bilingual" : hasAr ? "ar" : "en", fields: parseLines(pages, kind) };
}
