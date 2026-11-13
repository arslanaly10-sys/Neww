import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { listDeals, type DealView } from "@/lib/deals";
import { can } from "@/lib/permissions";
import { dateFmt, money, pct } from "@/lib/format";
import { SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Card, PageHeader } from "@/components/ui";
import { KPI5, Stat } from "@/components/stat";
import { Stagger } from "@/components/motion";
import { NoAccess } from "@/components/no-access";
import { Pipeline, type Card as BoardCard } from "@/components/deals/board";
import { NewDeal } from "@/components/deals/form";
import { CountUp } from "@/components/charts/motion-charts";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("deals");

export default async function DealsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ view?: string; k?: string }> }) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("deals");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("deals");
  const data = (await listDeals(user))!;
  const ar = locale === "ar";
  const M = (n: number) => money(n, currency, locale, { compact: true, fx: SAMPLE_FX_EGP_PER_USD });
  const view = sp.view === "list" ? "list" : "board";
  const kind = sp.k === "buy" || sp.k === "sell" ? sp.k : null;
  const items = data.items.filter((x) => !kind || x.kind === kind);
  const manage = can(user.role, "deals.manage");
  const card = (x: DealView): BoardCard => ({
    id: x.id, title: (ar && x.titleAr) || x.title, kind: x.kind, stage: x.stage, position: x.position, place: ar ? x.districtNameAr : x.districtName,
    price: M(x.offerEgp ?? x.askingEgp), marketDiff: x.market?.diff ?? null, owner: ar ? x.ownerNameAr : x.ownerName, close: x.expectedClose ? dateFmt(x.expectedClose, locale) : null, overdue: x.overdue, shared: x.shared,
  });
  const href = (o: { view?: string; k?: string | null }) => {
    const p = new URLSearchParams();
    const v = o.view ?? view, k = o.k === undefined ? kind : o.k;
    if (v !== "board") p.set("view", v);
    if (k) p.set("k", k);
    const q = p.toString();
    return q ? `/deals?${q}` : "/deals";
  };
  const chip = (on: boolean) => cn("inline-flex min-h-10 items-center rounded-full border px-3 text-sm", on ? "border-gold bg-gold-fill text-on-gold" : "border-line hover:bg-surface-2");
  const funnel = data.funnel.map((f) => { const xs = items.filter((x) => x.stage === f.stage); return { stage: f.stage, count: xs.length, value: M(xs.reduce((s, x) => s + (x.offerEgp ?? x.askingEgp), 0)) }; });

  return (
    <div className="space-y-6">
      <PageHeader animated title={t("title")} lead={user.role === "manager" ? t("lead") : t("leadInvestor")}>
        {manage && <NewDeal managers={data.managers} districts={data.districts} assets={data.assets} me={user.id} />}
      </PageHeader>
      <Stagger as="section" className={KPI5} aria-label={t("totals")}>
        <Stat label={t("kOpen")}><CountUp value={data.totals.open} /></Stat>
        <Stat label={t("kBuying")}><span className="num">{M(data.totals.buyingEgp)}</span></Stat>
        <Stat label={t("kSelling")}><span className="num">{M(data.totals.sellingEgp)}</span></Stat>
        <Stat label={t("kWeighted")} hint={t("kWeightedHint")}><span className="num">{M(data.totals.weightedEgp)}</span></Stat>
        <Stat label={t("kWon", { year: "2026" })}><span className="num">{data.totals.wonThisYear}</span><span className="text-base text-muted"> / {t("lostN", { n: data.totals.lostThisYear })}</span></Stat>
      </Stagger>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-2" aria-label={t("filterLabel")}>
          {([null, "buy", "sell"] as const).map((k) => <li key={k ?? "all"}><Link href={href({ k })} aria-current={kind === k ? "true" : undefined} className={chip(kind === k)}>{k ? t(`k_${k}`) : t("all")}</Link></li>)}
        </ul>
        <nav aria-label={t("viewLabel")} className="flex rounded-md border border-line p-0.5 text-sm">
          {(["board", "list"] as const).map((v) => <Link key={v} href={href({ view: v })} aria-current={view === v ? "page" : undefined} className={cn("inline-flex min-h-10 items-center rounded px-3", view === v ? "bg-surface-2 font-semibold text-gold" : "text-muted hover:text-text")}>{t(`view_${v}`)}</Link>)}
        </nav>
      </div>
      {items.length === 0 ? <Card className="text-sm text-muted">{t("empty")}</Card> : view === "board" ? (
        <>
          <Pipeline cards={items.map(card)} funnel={funnel} canManage={manage} />
          {manage && <p className="text-xs text-muted">{t("boardHint")}</p>}
        </>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[52rem] text-sm">
            <caption className="sr-only">{t("title")}</caption>
            <thead><tr className="border-b border-line text-xs text-muted">
              {["colDeal", "colStage", "colPrice", "colMarket", "colWeighted", "colOwner", "colClose"].map((h, i) => <th key={h} scope="col" className={cn("px-3 py-2 font-semibold", i >= 2 && i <= 4 ? "text-end" : "text-start")}>{t(h)}</th>)}
            </tr></thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                  <th scope="row" className="px-3 py-2 text-start font-normal"><Link href={`/deals/${x.id}`} className="font-semibold underline decoration-line underline-offset-4 hover:decoration-gold">{(ar && x.titleAr) || x.title}</Link><span className="block text-xs text-muted"><span className="num">{x.id}</span>, {t(`k_${x.kind}`)}, {ar ? x.districtNameAr : x.districtName}</span></th>
                  <td className="px-3 py-2">{t(`s_${x.stage}`)}</td>
                  <td className="px-3 py-2 text-end"><span className="num">{M(x.offerEgp ?? x.askingEgp)}</span></td>
                  <td className="px-3 py-2 text-end">{x.market ? <span className={cn("num", Math.abs(x.market.diff) < 0.05 ? "" : x.market.diff > 0 ? "text-danger" : "text-ok")}>{x.market.diff > 0 ? "+" : ""}{pct(x.market.diff, locale, 0)}</span> : "–"}</td>
                  <td className="px-3 py-2 text-end"><span className="num">{M(x.weightedEgp)}</span></td>
                  <td className="px-3 py-2">{ar ? x.ownerNameAr : x.ownerName}</td>
                  <td className={cn("px-3 py-2", x.overdue && "text-danger")}>{x.expectedClose ? dateFmt(x.expectedClose, locale) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">{t("note")}</p>
    </div>
  );
}
