/** "3 hours ago" in the reader's language, falling back to a date after a month. */
export function timeAgo(iso: string, locale: string, now = Date.now()) {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { numeric: "auto" });
  const a = Math.abs(s);
  if (a < 60) return rtf.format(Math.round(s), "second");
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
  return new Date(iso).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium", numberingSystem: "latn" } as Intl.DateTimeFormatOptions);
}
