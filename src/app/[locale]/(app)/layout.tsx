import { getTranslations, setRequestLocale } from "next-intl/server";
import { asc, sql } from "drizzle-orm";
import { redirect } from "@/i18n/navigation";
import { getDb, withSession } from "@/db/client";
import { assets, districts, documents, users } from "@/db/schema";
import { getCurrency, getCurrentUser, toSession } from "@/lib/session";
import { AREAS, AREA_ACCESS } from "@/lib/permissions";
import { DEMO_TODAY, SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { dateFmt } from "@/lib/format";
import { Wordmark } from "@/components/brand";
import { SideNav, TabBar } from "@/components/shell/nav";
import { CurrencyToggle, LangToggle, RoleSwitcher } from "@/components/shell/controls";
import { CommandBar } from "@/components/shell/command-bar";
import { AccountSheet } from "@/components/shell/account-sheet";
import { NotificationsMenu } from "@/components/notify/menu";
import { unreadCount } from "@/lib/notify";
import { HorusProvider } from "@/components/horus/provider";
import { HorusBubble, HorusButton, HorusPanel } from "@/components/horus/panel";
import { can } from "@/lib/permissions";
import { attentionCount } from "@/lib/alerts-service";
import { Link } from "@/i18n/navigation";
import { Bell } from "lucide-react";

export default async function AppShell({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/", locale });
  const currency = await getCurrency();
  const s = await getTranslations("sample");
  const al = await getTranslations("al");
  const attention = await attentionCount(user);
  const badges = attention.total ? { overview: attention.total } : {};
  const areas = AREAS.filter((a) => AREA_ACCESS[a].includes(user.role));

  const db = await getDb();
  const demoUsers = (await db.select().from(users).orderBy(asc(sql`case role when 'investor' then 1 when 'manager' then 2 else 3 end`), asc(users.id))).filter((u) => u.status !== "deactivated");
  const index = await withSession(toSession(user), async (tx) => {
    const a = await tx.select({ id: assets.id, name: assets.name, nameAr: assets.nameAr, district: districts.name, districtAr: districts.nameAr }).from(assets).innerJoin(districts, sql`${assets.districtId} = ${districts.id}`);
    const d = await tx.select({ id: documents.id, title: documents.title, kind: documents.kind, assetId: documents.assetId }).from(documents);
    const names = new Map(a.map((x) => [x.id, x]));
    return {
      assets: a,
      docs: d.filter((x) => x.kind === "lease" || x.kind === "title_deed").map((x) => ({ ...x, assetName: names.get(x.assetId)?.name ?? "", assetNameAr: names.get(x.assetId)?.nameAr ?? "" })),
    };
  });
  const sh = await getTranslations("shell");
  // Currency only matters to roles that see money; the administrator never does.
  const controls = (
    <>
      {can(user.role, "portfolio.view") && <CurrencyToggle current={currency} rate={SAMPLE_FX_EGP_PER_USD} />}
      <RoleSwitcher users={demoUsers.map((u) => ({ id: u.id, name: u.name, nameAr: u.nameAr, role: u.role as "investor" }))} currentId={user.id} />
      <LangToggle />
    </>
  );
  const allDistricts = await db.select({ id: districts.id, name: districts.name, nameAr: districts.nameAr }).from(districts).orderBy(districts.name);

  return (
    <HorusProvider>
    <div className="min-h-dvh md:grid md:grid-cols-[15.5rem_1fr]">
      <aside className="hidden border-e border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:gap-6 md:overflow-y-auto md:px-3 md:py-5">
        <div className="px-3"><Wordmark /></div>
        <SideNav areas={areas} badges={badges} />
        <div className="mt-auto px-3 text-xs text-muted">
          <p>{s("asOf", { date: dateFmt(DEMO_TODAY, locale) })}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col pb-20 md:pb-0">
        <div role="note" className="bg-gold-fill px-4 py-1.5 text-center text-xs font-semibold text-on-gold">{s("ribbon")}</div>
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur">
          <div className="me-auto md:hidden"><Wordmark className="text-base" /></div>
          <CommandBar index={{ areas, assets: index.assets, districts: allDistricts, docs: index.docs, currency, canAsk: can(user.role, "horus.use"), canValue: can(user.role, "valuation.run"), canPack: can(user.role, "pack.generate") }} className="w-11 justify-center px-0 md:w-80 md:max-w-sm md:flex-1 md:justify-start md:px-3" />
          <span className="hidden flex-1 md:block" />
          <NotificationsMenu initialUnread={await unreadCount(user)} />
          <Link href="/overview/alerts" aria-label={attention.total ? al("badge", { n: attention.total }) : al("bell")} className="relative grid size-11 place-items-center md:size-9 rounded-md border border-line hover:bg-surface-2">
            <Bell aria-hidden="true" size={16} />
            {attention.total ? <span aria-hidden="true" className="num absolute -end-1.5 -top-1.5 min-w-4 rounded-full bg-gold-fill px-1 text-center text-[10px] font-bold leading-4 text-on-gold">{attention.total}</span> : null}
          </Link>
          {can(user.role, "horus.use") && <HorusButton className="hidden md:inline-flex" />}
          <div className="hidden items-center gap-2 md:flex">{controls}</div>
          <AccountSheet label={sh("account")}>{controls}</AccountSheet>
        </div>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-9">{children}</main>
        <footer className="border-t border-line px-4 py-4 text-xs text-muted md:px-8">{s("footer")}</footer>
      </div>
      <TabBar areas={areas} badges={badges} />
      {can(user.role, "help.use") && <HorusPanel role={user.role} />}
      {can(user.role, "help.use") && <HorusBubble helpOnly={!can(user.role, "horus.use")} />}
    </div>
    </HorusProvider>
  );
}
