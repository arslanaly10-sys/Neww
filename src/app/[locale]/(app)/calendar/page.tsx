import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarDays, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { pageContext } from "@/lib/page";
import { eventOptions, getMonth, sourcesFor, SOURCES, type CalItem, type Source } from "@/lib/calendar";
import { addDays, addMonthsTo, isMonth, isWeekend } from "@/lib/calendar-dates";
import { DEMO_TODAY } from "@/lib/assumptions";
import { can } from "@/lib/permissions";
import { rangeSep } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { buttonStyles, Card, PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { NewEvent } from "@/components/calendar/controls";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("cal");

/** The colour band each source wears; the source is also always named in text, so colour is never the only cue. */
const BAND: Record<Source, string> = { events: "border-s-gold", leases: "border-s-teal", rent: "border-s-ok", work: "border-s-muted", finance: "border-s-ok", deals: "border-s-gold", reports: "border-s-line" };

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ m?: string; view?: string; s?: string; deleted?: string }> }) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const { user, denied } = await pageContext("calendar");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("cal");
  const lang = locale === "ar" ? "ar" : "en";
  const ar = lang === "ar";
  const month = isMonth(sp.m) ? sp.m : DEMO_TODAY.slice(0, 7);
  const view = sp.view === "agenda" ? "agenda" : "month";
  const mine = sourcesFor(user.role);
  const picked = (sp.s ?? "").split(",").filter((x): x is Source => (mine as string[]).includes(x));
  const only = picked.length ? picked : undefined;
  const full = (await getMonth(user, lang, month))!;
  const data = { ...full, items: only ? full.items.filter((i) => only.includes(i.source)) : full.items };
  const all = full.items.filter((i) => i.date.startsWith(month));
  const manage = can(user.role, "calendar.manage");
  const opts = manage ? await eventOptions(user) : null;

  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(ar ? "ar-EG-u-nu-latn" : "en-GB", { ...o, timeZone: "UTC" });
  const monthName = fmt({ month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00Z`));
  const dayLong = fmt({ weekday: "long", day: "numeric", month: "long" });
  const dayNum = fmt({ day: "numeric" });
  const wkShort = fmt({ weekday: "short" });
  const wkLong = fmt({ weekday: "long" });
  const href = (o: { m?: string; view?: string; s?: Source[] }) => {
    const p = new URLSearchParams();
    const m = o.m ?? month, v = o.view ?? view, s = o.s ?? picked;
    if (m !== DEMO_TODAY.slice(0, 7)) p.set("m", m);
    if (v !== "month") p.set("view", v);
    if (s.length) p.set("s", s.join(","));
    const q = p.toString();
    return q ? `/calendar?${q}` : "/calendar";
  };
  const toggle = (s: Source) => (picked.includes(s) ? picked.filter((x) => x !== s) : [...picked, s]);
  const chip = (on: boolean) => cn("inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm", on ? "border-gold bg-gold-fill text-on-gold" : "border-line hover:bg-surface-2");
  const byDay = new Map<string, CalItem[]>();
  for (const i of data.items) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]);
  const inMonth = data.items.filter((i) => i.date.startsWith(month));
  const count = (s: Source) => all.filter((i) => i.source === s).length;
  const overdue = inMonth.filter((i) => i.overdue).length;
  const next7 = data.items.filter((i) => i.date >= DEMO_TODAY && i.date <= addDays(DEMO_TODAY, 6));

  const label = (i: CalItem) => (i.start ? <><span className="num">{i.start}</span>{i.end && <>{rangeSep(locale)}<span className="num">{i.end}</span></>}</> : null);
  const item = (i: CalItem, compact?: boolean) => (
    <Link key={i.id} href={i.link} className={cn("block rounded-sm border-s-[3px] bg-surface-2/60 px-1.5 py-0.5 text-start hover:bg-surface-2", BAND[i.source], i.overdue && "border-s-danger", compact ? "text-xs leading-snug" : "text-sm")}>
      {i.start && <span className="num me-1 text-muted">{i.start}</span>}
      <span className={cn(compact && "line-clamp-2")}>{i.title}</span>
      <span className="sr-only">{`, ${t(`src_${i.source}`)}${i.overdue ? `, ${t("overdue")}` : ""}`}</span>
    </Link>
  );

  const agendaList = (items: CalItem[], className?: string) => {
    const days = [...new Set(items.map((i) => i.date))];
    if (!days.length) return <Card className={cn("text-sm text-muted", className)}>{t("emptyMonth")}</Card>;
    return (
      <ol className={cn("space-y-4", className)} aria-label={t("agendaLabel", { month: monthName })}>
        {days.map((d) => (
          <li key={d} id={`d-${d}`} className="scroll-mt-24">
            <h3 className={cn("mb-1.5 text-sm font-semibold", d === DEMO_TODAY && "text-gold")}>{dayLong.format(new Date(`${d}T00:00:00Z`))}{d === DEMO_TODAY && <span> ({t("today")})</span>}</h3>
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {items.filter((i) => i.date === d).map((i) => (
                <li key={i.id}>
                  <Link href={i.link} className={cn("flex gap-3 border-s-[3px] px-3 py-2.5 text-sm hover:bg-surface-2", BAND[i.source], i.overdue && "border-s-danger")}>
                    <span className="w-28 shrink-0 text-muted">{label(i) ?? t("allDay")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{i.title}</span>
                      <span className="block text-xs text-muted">{[t(`src_${i.source}`), i.source === "events" ? t(`k_${i.kind}` as "k_meeting") : null, i.assetName, i.detail, i.overdue ? t("overdue") : null, i.invited ? t("invited") : null, i.shared && user.role === "manager" ? t("sharedTag") : null].filter(Boolean).join(ar ? "، " : ", ")}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader animated title={t("title")} lead={t("lead")}>
        <div className="flex flex-wrap items-center gap-2">
          {manage && opts && <NewEvent people={opts.people} assets={opts.assets} me={user.id} defaultDate={month === DEMO_TODAY.slice(0, 7) ? DEMO_TODAY : `${month}-01` < DEMO_TODAY ? DEMO_TODAY : `${month}-01`} />}
          <a href={`/api/calendar?lang=${lang}`} download className={buttonStyles({ variant: "outline", size: "sm" })}><Download aria-hidden="true" size={14} />{t("ics")}</a>
        </div>
      </PageHeader>
      {sp.deleted && /^CE-\d{3}$/.test(sp.deleted) && <p role="status" className="text-sm text-ok">{t("deleted", { id: sp.deleted })}</p>}

      <section aria-labelledby="soon-h" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="soon-h" className="mb-2 flex items-center gap-2 font-semibold"><CalendarDays aria-hidden="true" size={16} className="text-gold" />{t("next7", { n: next7.length })}</h2>
        {next7.length === 0 ? <p className="text-sm text-muted">{t("next7None")}</p> : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {next7.slice(0, 6).map((i) => <li key={i.id}><Link href={i.link} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 hover:bg-surface-2"><span className="num text-muted">{dayNum.format(new Date(`${i.date}T00:00:00Z`))} {wkShort.format(new Date(`${i.date}T00:00:00Z`))}</span>{i.title}</Link></li>)}
            {next7.length > 6 && <li><Link href={href({ view: "agenda", m: DEMO_TODAY.slice(0, 7) })} className="inline-flex min-h-10 items-center px-2 text-gold underline underline-offset-4">{t("andMore", { n: next7.length - 6 })}</Link></li>}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={href({ m: addMonthsTo(month, -1) })} className="grid size-11 place-items-center rounded-md border border-line hover:bg-surface-2" aria-label={t("prev")}><ChevronLeft aria-hidden="true" size={18} className="rtl:rotate-180" /></Link>
          <h2 className="min-w-44 px-2 text-center font-display text-2xl" aria-live="polite">{monthName}</h2>
          <Link href={href({ m: addMonthsTo(month, 1) })} className="grid size-11 place-items-center rounded-md border border-line hover:bg-surface-2" aria-label={t("next")}><ChevronRight aria-hidden="true" size={18} className="rtl:rotate-180" /></Link>
          {month !== DEMO_TODAY.slice(0, 7) && <Link href={href({ m: DEMO_TODAY.slice(0, 7) })} className="ms-1 inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm hover:bg-surface-2">{t("today")}</Link>}
        </div>
        <nav aria-label={t("viewLabel")} className="flex rounded-md border border-line p-0.5 text-sm">
          {(["month", "agenda"] as const).map((v) => <Link key={v} href={href({ view: v })} aria-current={view === v ? "page" : undefined} className={cn("inline-flex min-h-10 items-center rounded px-3", view === v ? "bg-surface-2 font-semibold text-gold" : "text-muted hover:text-text")}>{t(`view_${v}`)}</Link>)}
        </nav>
      </div>

      <ul className="flex flex-wrap gap-2" aria-label={t("filterLabel")}>
        <li><Link href={href({ s: [] })} aria-current={!picked.length ? "true" : undefined} className={chip(!picked.length)}>{t("all")} <span className="num">{all.length}</span></Link></li>
        {SOURCES.filter((s) => mine.includes(s)).map((s) => (
          <li key={s}><Link href={href({ s: toggle(s) })} aria-current={picked.includes(s) ? "true" : undefined} className={chip(picked.includes(s))}><span aria-hidden="true" className={cn("h-3.5 border-s-[3px]", BAND[s])} />{t(`src_${s}`)} <span className="num">{count(s)}</span></Link></li>
        ))}
        {overdue > 0 && <li className="inline-flex min-h-10 items-center px-2 text-sm text-danger">{t("overdueCount", { n: overdue })}</li>}
      </ul>

      {view === "month" ? (
        <>
          <div className="hidden md:block">
            <table className="w-full table-fixed border-collapse overflow-hidden rounded-lg border border-line bg-surface text-sm">
              <caption className="sr-only">{t("gridCaption", { month: monthName })}</caption>
              <thead>
                <tr>{data.weeks[0].map((d) => <th key={d} scope="col" className={cn("border-b border-line px-2 py-2 text-start text-xs font-semibold text-muted", isWeekend(d) && "bg-surface-2/50")}><abbr title={wkLong.format(new Date(`${d}T00:00:00Z`))} className="no-underline">{wkShort.format(new Date(`${d}T00:00:00Z`))}</abbr></th>)}</tr>
              </thead>
              <tbody>
                {data.weeks.map((w) => (
                  <tr key={w[0]}>
                    {w.map((d) => {
                      const items = byDay.get(d) ?? [];
                      const out = !d.startsWith(month);
                      const today = d === DEMO_TODAY;
                      return (
                        <td key={d} className={cn("h-32 border border-line p-1.5 align-top", isWeekend(d) && "bg-surface-2/50", out && "bg-bg")} aria-current={today ? "date" : undefined}>
                          <div className="mb-1 flex items-center justify-between">
                            <span className={cn("grid size-7 place-items-center rounded-full text-xs font-semibold", today ? "bg-gold-fill text-on-gold" : out ? "text-muted" : "")}><span className="num">{dayNum.format(new Date(`${d}T00:00:00Z`))}</span></span>
                            <span className="sr-only">{dayLong.format(new Date(`${d}T00:00:00Z`))}{today ? `, ${t("today")}` : ""}{items.length ? `, ${t("nItems", { n: items.length })}` : ""}</span>
                          </div>
                          <div className="space-y-1">
                            {items.slice(0, 3).map((i) => item(i, true))}
                            {items.length > 3 && <Link href={`${href({ view: "agenda", m: d.slice(0, 7) })}#d-${d}`} className="block px-1 text-xs text-gold underline underline-offset-2">{t("more", { n: items.length - 3 })}</Link>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {agendaList(inMonth, "md:hidden")}
        </>
      ) : agendaList(inMonth)}

      <p className="text-xs text-muted">{user.role === "manager" ? t("noteManager") : t("noteInvestor")}</p>
    </div>
  );
}
