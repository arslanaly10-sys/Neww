import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { pageContext } from "@/lib/page";
import { eventOptions, getEvent } from "@/lib/calendar";
import { can } from "@/lib/permissions";
import { listSep, rangeSep } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { EventActions } from "@/components/calendar/controls";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: /^CE-\d{3}$/.test(id) ? id : "Event" };
}

export default async function EventPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ created?: string; clash?: string }> }) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const { user, denied } = await pageContext("calendar");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("cal");
  const e = await getEvent(user, id);
  if (!e) notFound();
  const ar = locale === "ar";
  const manage = can(user.role, "calendar.manage");
  const opts = manage ? await eventOptions(user) : null;
  const day = new Intl.DateTimeFormat(ar ? "ar-EG-u-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${e.date}T00:00:00Z`));
  const clashIds = (sp.clash ?? "").split(",").filter((x) => /^CE-\d{3}$/.test(x)).slice(0, 5);
  const clashes = (await Promise.all(clashIds.map((c) => getEvent(user, c)))).filter((x) => !!x);
  const title = (ar && e.titleAr) || e.title;
  const name = (p: { name: string; nameAr: string }) => (ar ? p.nameAr : p.name);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/calendar?m=${e.date.slice(0, 7)}`} className="tap mb-3 inline-block text-sm text-gold underline underline-offset-4">{t("title")}</Link>
        <PageHeader title={title} lead={`${e.id}${listSep(locale)}${day}`}>
          <span className="flex flex-wrap gap-2"><Badge tone="gold">{t(`k_${e.kind}` as "k_meeting")}</Badge>{e.shared && <Badge tone="teal">{t("sharedTag")}</Badge>}{e.attendees.includes(user.id) && <Badge tone="ok">{t("invited")}</Badge>}</span>
        </PageHeader>
      </div>
      {sp.created === "1" && <p role="status" className="flex items-start gap-1.5 text-sm text-ok"><CheckCircle2 aria-hidden="true" size={16} className="mt-0.5 shrink-0" />{t("created", { id: e.id })}</p>}
      {clashes.length > 0 && (
        <p role="status" className="flex items-start gap-1.5 text-sm text-gold"><AlertTriangle aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
          {t("clash", { list: clashes.map((c) => `${(ar && c.titleAr) || c.title}${c.startTime ? ` (${c.startTime})` : ""}`).join(ar ? "، " : ", ") })}
        </p>
      )}
      <Card>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">{t("fDate")}</dt><dd>{day}</dd></div>
          <div><dt className="text-muted">{t("time")}</dt><dd>{e.startTime ? <><span className="num">{e.startTime}</span>{e.endTime && <>{rangeSep(locale)}<span className="num">{e.endTime}</span></>}</> : t("allDay")}</dd></div>
          <div><dt className="text-muted">{t("fAsset")}</dt><dd>{e.asset ? <Link href={`/asset/${e.asset.id}`} className="underline decoration-line underline-offset-4 hover:decoration-gold">{e.asset.id}: {name(e.asset)}</Link> : t("noAsset")}</dd></div>
          <div><dt className="text-muted">{t("fLocation")}</dt><dd>{e.location || "–"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted">{t("fPeople")}</dt>
            <dd>{e.people.length ? <ul className="mt-1 flex flex-wrap gap-2">{e.people.map((p) => <li key={p.id} className="rounded-full border border-line px-3 py-1">{name(p)}<span className="text-muted">{listSep(locale)}{ar ? p.titleAr : p.title}</span></li>)}</ul> : t("nobody")}</dd></div>
          {e.notes && <div className="sm:col-span-2"><dt className="text-muted">{t("fNotes")}</dt><dd className="whitespace-pre-line">{e.notes}</dd></div>}
          <div className="sm:col-span-2"><dt className="text-muted">{t("organiser")}</dt><dd>{e.creator ? name(e.creator) : e.createdBy}</dd></div>
        </dl>
      </Card>
      {manage && opts && (
        <EventActions id={e.id} me={user.id} people={opts.people} assets={opts.assets}
          v={{ title: e.title, titleAr: e.titleAr, kind: e.kind, date: e.date, startTime: e.startTime, endTime: e.endTime, assetId: e.assetId, location: e.location, notes: e.notes, shared: e.shared, attendees: e.attendees }} />
      )}
      <p className="text-xs text-muted">{t("eventNote")}</p>
    </div>
  );
}
