/** Calendar date arithmetic on ISO dates (YYYY-MM-DD), in UTC so the result never depends on the server's zone. */
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (d: string, n: number) => { const x = D(d); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
export const addMonthsTo = (month: string, n: number) => { const x = D(`${month}-01`); x.setUTCMonth(x.getUTCMonth() + n); return iso(x).slice(0, 7); };
/** 0 = Sunday … 6 = Saturday. */
export const weekday = (d: string) => D(d).getUTCDay();
export const isMonth = (m: string | undefined): m is string => !!m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m >= "2025-01" && m <= "2028-12";

/** The working week in Egypt runs Sunday to Thursday, so weeks start on Sunday and Friday and Saturday are the weekend. */
export const WEEK_START = 0;
export const isWeekend = (d: string) => [5, 6].includes(weekday(d));

/** Whole weeks covering a month: from the Sunday on or before the 1st to the Saturday on or after the last day. */
export function monthGrid(month: string) {
  const first = `${month}-01`;
  const last = addDays(`${addMonthsTo(month, 1)}-01`, -1);
  const from = addDays(first, -((weekday(first) - WEEK_START + 7) % 7));
  const to = addDays(last, (6 - ((weekday(last) - WEEK_START + 7) % 7)));
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return { month, first, last, from, to, days, weeks: Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7)) };
}
