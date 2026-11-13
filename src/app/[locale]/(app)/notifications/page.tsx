import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { getPrefs, listNotifications, N_CATEGORIES } from "@/lib/notify";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Card, PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { HashTabs } from "@/components/hash-tabs";
import { InboxActions, MarkOneRead, PrefsForm } from "@/components/notify/menu";
import { timeAgo } from "@/lib/time-ago";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("ntf");

export default async function NotificationsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ c?: string; u?: string }> }) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const { user, denied } = await pageContext("notifications");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("ntf");
  const lang = locale === "ar" ? "ar" : "en";
  const cat = (N_CATEGORIES as readonly string[]).includes(sp.c ?? "") ? sp.c! : undefined;
  const unreadOnly = sp.u === "1";
  const all = await listNotifications(user, lang);
  const items = all.filter((n) => (!cat || n.category === cat) && (!unreadOnly || !n.read));
  const unread = all.filter((n) => !n.read).length;
  const prefs = await getPrefs(user);
  const q = (c?: string, u?: boolean) => { const p = new URLSearchParams(); if (c) p.set("c", c); if (u) p.set("u", "1"); const s = p.toString(); return s ? `/notifications?${s}` : "/notifications"; };
  const chip = (on: boolean) => cn("inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm", on ? "border-gold bg-gold-fill text-on-gold" : "border-line hover:bg-surface-2");
  const cats = N_CATEGORIES.filter((c) => all.some((n) => n.category === c));

  const inbox = (
    <section aria-labelledby="ib-h" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ib-h" className="font-display text-2xl">{t("inboxTitle", { n: unread })}</h2>
        <InboxActions hasUnread={unread > 0} />
      </div>
      <ul className="flex flex-wrap gap-2" aria-label={t("filterLabel")}>
        <li><Link href={q(undefined, unreadOnly)} aria-current={!cat ? "true" : undefined} className={chip(!cat)}>{t("all")}</Link></li>
        {cats.map((c) => <li key={c}><Link href={q(c, unreadOnly)} aria-current={cat === c ? "true" : undefined} className={chip(cat === c)}>{t(`c_${c}` as "c_work")}</Link></li>)}
        <li><Link href={q(cat, !unreadOnly)} aria-current={unreadOnly ? "true" : undefined} className={chip(unreadOnly)}>{t("unreadOnly")}</Link></li>
      </ul>
      {items.length === 0 ? <Card className="text-sm text-muted">{unreadOnly ? t("noneUnread") : t("empty")}</Card> : (
        <ul aria-label={t("title")} className="divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((n) => (
            <li key={n.id} className={cn("flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm", !n.read && "bg-gold-fill/10")}>
              <div className="flex min-w-0 gap-3">
                <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-gold-fill")} />
                <div className="min-w-0">
                  <p className={cn(!n.read && "font-semibold")}>{n.link ? <Link href={n.link} className="underline decoration-line underline-offset-4 hover:decoration-gold">{n.title}</Link> : n.title}{!n.read && <span className="sr-only"> ({t("unread")})</span>}</p>
                  {n.body && <p className="text-muted">{n.body}</p>}
                  <p className="text-xs text-muted">{t(`c_${n.category}` as "c_work")}, {timeAgo(n.createdAt, locale)}</p>
                </div>
              </div>
              {!n.read && <MarkOneRead id={n.id} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const settings = (
    <section aria-labelledby="pr-h" className="space-y-3">
      <h2 id="pr-h" className="font-display text-2xl">{t("prefsTitle")}</h2>
      <p className="max-w-md text-sm text-muted">{t("prefsLead")}</p>
      <PrefsForm prefs={prefs} />
    </section>
  );

  return (
    <div>
      <PageHeader animated title={t("title")} lead={t("lead")} />
      <HashTabs label={t("title")} tabs={[{ id: "inbox", label: t("tabInbox"), count: unread, content: inbox }, { id: "settings", label: t("tabSettings"), content: settings }]} />
    </div>
  );
}
