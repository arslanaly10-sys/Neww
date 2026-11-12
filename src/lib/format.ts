import { SAMPLE_FX_EGP_PER_USD } from "./assumptions";

export type Currency = "EGP" | "USD";
const loc = (l: string) => (l === "ar" ? "ar-EG-u-nu-latn" : "en-GB");

/** Convert whole EGP into the display currency using the active assumption-set rate. */
export const convert = (egp: number, cur: Currency, fx = SAMPLE_FX_EGP_PER_USD) => (cur === "USD" ? egp / fx : egp);

const CUR_AR: Record<Currency, string> = { EGP: "جنيه", USD: "دولار" };
const UNIT = {
  en: { b: "bn", m: "m", k: "k" },
  ar: { b: "مليار", m: "مليون", k: "ألف" },
} as const;

const plain = (v: number, locale: string, digits = 0) =>
  new Intl.NumberFormat(loc(locale), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);

/**
 * Money for display. English: "EGP 1,025,566,000" / "EGP 1.03bn". Arabic: "1,025,566,000 جنيه" / "1.03 مليار جنيه".
 * The Arabic form puts the currency word after the number, the way it is read and written.
 */
export function money(egp: number, cur: Currency, locale: string, opts: { compact?: boolean; fx?: number } = {}) {
  const v = convert(egp, cur, opts.fx);
  const ar = locale === "ar";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  let body: string, suffix = "";
  if (opts.compact && a >= 1e3) {
    const [div, key] = a >= 1e9 ? [1e9, "b"] : a >= 1e6 ? [1e6, "m"] : [1e3, "k"];
    const x = a / div;
    body = plain(x, locale, key === "b" ? 2 : x >= 100 ? 0 : 1);
    suffix = UNIT[ar ? "ar" : "en"][key as "b"];
  } else {
    body = plain(a, locale, 0);
  }
  if (ar) return `${sign}${body}${suffix ? ` ${suffix}` : ""} ${CUR_AR[cur]}`;
  return `${sign}${cur === "USD" ? "USD " : "EGP "}${body}${suffix}`;
}
export const pct = (x: number, locale: string, digits = 1) =>
  new Intl.NumberFormat(loc(locale), { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x);
export const int = (x: number, locale: string) => new Intl.NumberFormat(loc(locale)).format(x);
/** Joins meta items (district, type, size): a comma, the Arabic comma in Arabic. Replaces the old middle dot. */
export const listSep = (locale: string) => (locale === "ar" ? "، " : ", ");
/** Between the two ends of a range (dates, values): a word, never a dash. */
export const rangeSep = (locale: string) => (locale === "ar" ? " إلى " : " to ");
export const dateFmt = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(loc(locale), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
