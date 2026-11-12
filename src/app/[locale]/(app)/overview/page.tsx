import { getTranslations, setRequestLocale } from "next-intl/server";
import { desc, eq, sql } from "drizzle-orm";
import { withSession, getDb } from "@/db/client";
import { auditEvents, investorUpdates } from "@/db/schema";
import { pageContext } from "@/lib/page";
import { getPortfolio } from "@/lib/access";
import { portfolioMetrics } from "@/lib/metrics";
import { dateFmt, int, money, pct } from "@/lib/format";
import { Fig, SampleBadge } from "@/components/fig";
import { Stat } from "@/components/stat";
import { Card, PageHeader } from "@/components/ui";
import { HorusGlyph } from "@/components/brand";
import { Link } from "@/i18n/navigation";
import { SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { attentionCount, getAlerts } from "@/lib/alerts-service";
import { LiveFeed } from "@/components/alerts/live-feed";
import { AttentionCard } from "@/components/alerts/attention-card";
import { verifyChain } from "@/lib/audit-service";
import { GrowBar, Stagger } from "@/components/motion";

export default async function Overview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, currency } = await pageContext("overview");
  const t = await getTranslations("overview");
  const ta = await getTranslations("admin");
  const b = await getTranslations("brand");

  if (user.role === "admin") {
    const db = await getDb();
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(auditEvents);
    const [head] = await db.select().from(auditEvents).orderBy(desc(auditEvents.seq)).limit(1);
    const pol = await db.execute(sql`select count(*)::int as n from pg_policies where schemaname = 'public'`);
    const chain = await verifyChain();
    const att = await attentionCount(user);
    const g = await getTranslations("gov2");
    const al = await getTranslations("al");
    return (
      <div>
        <PageHeader title={ta("title")} lead={ta("lead")}><SampleBadge /></PageHeader>
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label={ta("events")}><span className="num">{int(n, locale)}</span></Stat>
          <Stat label={ta("policies")}><span className="num">{int((pol.rows[0] as { n: number }).n, locale)}</span></Stat>
          <Stat label={ta("head")}><span className="num break-all font-sans text-base">{head?.hash.slice(0, 16)}…</span></Stat>
          <Stat label={g("audTitle")}><span className={chain.ok ? "text-ok" : "text-danger"}>{chain.ok ? g("chainOk") : g("chainBad", { seq: chain.firstBad!.seq })}</span></Stat>
          <Stat label={al("approvalsTitle")}><Link href="/overview/alerts" className="num underline decoration-gold/50 underline-offset-4">{int(att.approvals, locale)}</Link></Stat>
        </Stagger>
        <div className="mt-6"><LiveFeed currency={currency} fx={SAMPLE_FX_EGP_PER_USD} limit={6} compact /></div>
        <p className="mt-8 flex items-center gap-2 text-sm text-gold"><HorusGlyph size={18} />{b("triad")}</p>
      </div>
    );
  }

  const rows = await getPortfolio(user);
  const m = portfolioMetrics(rows);
  const updates = await withSession({ userId: user.id, role: user.role }, (tx) =>
    tx.select().from(investorUpdates).where(eq(investorUpdates.status, "published")).orderBy(desc(investorUpdates.postedOn)).limit(3));
  const maxAlloc = Math.max(...m.allocation.map((a) => a.value));
  const rate = SAMPLE_FX_EGP_PER_USD;
  const [alerts, att] = await Promise.all([getAlerts(user), attentionCount(user)]);

  return (
    <div>
      <PageHeader title={t("title")} lead={t("lead")}><SampleBadge /></PageHeader>
      <Stagger as="section" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label={t("value")}>
          <Fig label={t("value")} value={money(m.value, currency, locale, { compact: true })} source={t("valueSrc", { n: m.count })}
            calc={`${money(m.value, "EGP", locale)}${currency === "USD" ? ` ÷ ${rate}` : ""}`} />
        </Stat>
        <Stat label={t("cost")}>
          <Fig label={t("cost")} value={money(m.cost, currency, locale, { compact: true })} source={t("costSrc")} />
        </Stat>
        <Stat label={t("gain")} hint={<span className="num">{pct(m.gainPct, locale)}</span>}>
          <Fig label={t("gain")} value={money(m.gain, currency, locale, { compact: true })} source={t("gainSrc")} calc={`${money(m.value, "EGP", locale)} − ${money(m.cost, "EGP", locale)}`} />
        </Stat>
        <Stat label={t("assets")}>
          <Fig label={t("assets")} value={int(m.count, locale)} source={t("assetsSrc")} />
        </Stat>
        <Stat label={t("income")} hint={t("ofTotal", { total: int(m.count, locale) })}>
          <Fig label={t("income")} value={int(m.incomeUnits, locale)} source={t("incomeSrc")} />
        </Stat>
      </Stagger>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <AttentionCard top={alerts.open.slice(0, 4)} alertTotal={alerts.open.length} approvals={att.approvals} currency={currency} fx={rate} />
        <LiveFeed currency={currency} fx={rate} limit={5} compact />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-display text-xl">{t("allocation")}</h2>
          <ul className="space-y-3">
            {m.allocation.map((a, i) => (
              <li key={a.id}>
                <div className="mb-1 flex justify-between gap-3 text-sm">
                  <span>{locale === "ar" ? a.nameAr : a.name}</span>
                  <span className="num text-muted">{pct(a.value / m.value, locale)}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-2" role="img" aria-label={`${locale === "ar" ? a.nameAr : a.name}: ${pct(a.value / m.value, locale)}`}>
                  <GrowBar className="h-2 rounded-full bg-gold-fill" width={`${(a.value / maxAlloc) * 100}%`} rtl={locale === "ar"} delay={0.15 + i * 0.04} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-4 font-display text-xl">{t("updates")}</h2>
          <ul className="space-y-4">
            {updates.map((u) => (
              <li key={u.id} className="border-b border-line pb-4 last:border-0 last:pb-0">
                <p className="text-xs text-muted"><bdi>{dateFmt(u.postedOn, locale)}</bdi></p>
                <p className="font-semibold">{locale === "ar" ? u.titleAr : u.title}</p>
                <p className="mt-1 text-sm text-muted">{locale === "ar" ? u.bodyAr : u.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">{t("allUpdates")}</p>
        </Card>
      </div>
      <p className="mt-8 text-sm text-gold">{b("aiLine")}. <Link href="/governance" className="underline underline-offset-4">{b("triad")}</Link></p>
    </div>
  );
}
