import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { pageContext } from "@/lib/page";
import { getDeal, PROBABILITY } from "@/lib/deals";
import { can } from "@/lib/permissions";
import { dateFmt, int, listSep, money, pct } from "@/lib/format";
import { SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Badge, Card, PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { DealNote, EditDeal, StageStepper } from "@/components/deals/form";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: /^D-\d{3}$/.test(id) ? id : "Deal" };
}

export default async function DealPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("deals");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("deals");
  const ty = await getTranslations("types");
  const data = await getDeal(user, id);
  if (!data) notFound();
  const { deal: d, events } = data;
  const ar = locale === "ar";
  const M = (n: number) => money(n, currency, locale, { fx: SAMPLE_FX_EGP_PER_USD });
  const manage = can(user.role, "deals.manage");
  const who = (e: { actorName: string; actorNameAr: string }) => (ar ? e.actorNameAr : e.actorName);
  const mgr = (mid: unknown) => data.managers.find((m) => m.id === mid);
  const when = (x: Date) => x.toLocaleString(ar ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn", timeZone: "Africa/Cairo" });
  const evText = (e: (typeof events)[number]) => {
    const x = e.detail as Record<string, string | number | boolean | null>;
    switch (e.kind) {
      case "created": return t("ev_created", { who: who(e) });
      case "stage": return t("ev_stage", { who: who(e), to: t(`s_${x.to}` as "s_offer") });
      case "closed": return x.to === "won" ? t("ev_won", { who: who(e) }) : t("ev_lost", { who: who(e), reason: e.text });
      case "offer": return t("ev_offer", { who: who(e), amount: x.to ? M(Number(x.to)) : "–" });
      case "owner": return t("ev_owner", { who: who(e), to: (ar ? mgr(x.to)?.nameAr : mgr(x.to)?.name) ?? String(x.to) });
      case "shared": return x.shared ? t("ev_shared", { who: who(e) }) : t("ev_unshared", { who: who(e) });
      default: return t("ev_note", { who: who(e) });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/deals" className="tap mb-3 inline-block text-sm text-gold underline underline-offset-4">{t("title")}</Link>
        <PageHeader title={(ar && d.titleAr) || d.title} lead={`${d.id}${listSep(locale)}${t(`k_${d.kind}`)}${listSep(locale)}${ty(d.type as "villa")}${listSep(locale)}${ar ? d.districtNameAr : d.districtName}`}>
          <span className="flex flex-wrap gap-2"><Badge tone={d.stage === "won" ? "ok" : d.stage === "lost" ? "danger" : "gold"}>{t(`s_${d.stage}`)}</Badge>{d.shared && <Badge tone="teal">{t("sharedTag")}</Badge>}{d.overdue && <Badge tone="danger">{t("overdue")}</Badge>}</span>
        </PageHeader>
      </div>
      {sp.created === "1" && <p role="status" className="flex items-center gap-1.5 text-sm text-ok"><CheckCircle2 aria-hidden="true" size={16} />{t("created", { id: d.id })}</p>}
      <Card><StageStepper id={d.id} stage={d.stage} canManage={manage} />{d.stage === "lost" && d.lostReason && <p className="mt-3 text-sm"><span className="text-muted">{t("lostReason")}: </span>{d.lostReason}</p>}</Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">{t("fAsking")}</dt><dd className="num text-lg">{M(d.askingEgp)}</dd></div>
            <div><dt className="text-muted">{t("fOffer")}</dt><dd className="num text-lg">{d.offerEgp ? M(d.offerEgp) : "–"}</dd></div>
            <div><dt className="text-muted">{t("probability")}</dt><dd><span className="num">{pct(PROBABILITY[d.stage], locale, 0)}</span></dd></div>
            <div><dt className="text-muted">{t("colWeighted")}</dt><dd><span className="num">{M(d.weightedEgp)}</span></dd></div>
            <div><dt className="text-muted">{t("fArea")}</dt><dd>{d.areaSqm ? <span className="num">{int(d.areaSqm, locale)} m²</span> : "–"}</dd></div>
            <div><dt className="text-muted">{t("fOwner")}</dt><dd>{ar ? d.ownerNameAr : d.ownerName}</dd></div>
            <div><dt className="text-muted">{t("fClose")}</dt><dd className={cn(d.overdue && "text-danger")}>{d.expectedClose ? dateFmt(d.expectedClose, locale) : "–"}</dd></div>
            <div><dt className="text-muted">{t("fSource")}</dt><dd>{t(`src_${d.source}` as "src_broker")}</dd></div>
            {d.assetId && <div><dt className="text-muted">{t("fAsset")}</dt><dd><Link href={`/asset/${d.assetId}`} className="underline decoration-line underline-offset-4 hover:decoration-gold">{d.assetId}</Link></dd></div>}
            {manage && d.counterparty && <div><dt className="text-muted">{t("fCounterparty")}</dt><dd>{d.counterparty}</dd></div>}
            {manage && d.notes && <div className="sm:col-span-2"><dt className="text-muted">{t("fNotes")}</dt><dd className="whitespace-pre-line">{d.notes}</dd></div>}
          </dl>
          {manage && <div className="mt-5"><EditDeal id={d.id} managers={data.managers} districts={data.districts} assets={data.assets}
            v={{ kind: d.kind, title: d.title, titleAr: d.titleAr, districtId: d.districtId, type: d.type, areaSqm: d.areaSqm, assetId: d.assetId, askingEgp: d.askingEgp, offerEgp: d.offerEgp, ownerId: d.ownerId, counterparty: d.counterparty, source: d.source, expectedClose: d.expectedClose, notes: d.notes, shared: d.shared }} /></div>}
        </Card>
        <Card>
          <h2 className="mb-2 font-display text-xl">{t("marketTitle")}</h2>
          {d.market ? (
            <>
              <p className={cn("font-display text-3xl", Math.abs(d.market.diff) < 0.05 ? "" : d.market.diff > 0 ? "text-danger" : "text-ok")}>
                {Math.abs(d.market.diff) < 0.05 ? t("inLine") : d.market.diff > 0 ? t("above", { pct: pct(d.market.diff, locale, 0) }) : t("below", { pct: pct(-d.market.diff, locale, 0) })}
              </p>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted">{t("dealPpsqm")}</dt><dd className="num">{M(d.market.dealPpsqm)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">{t("medianPpsqm")}</dt><dd className="num">{M(d.market.medianPpsqm)}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-muted">{t("marketHow", { n: d.market.n })}</p>
            </>
          ) : <p className="text-sm text-muted">{t("noMarket")}</p>}
        </Card>
      </div>
      <Card>
        <h2 className="mb-3 font-display text-xl">{t("timeline")}</h2>
        <ol className="space-y-3 border-s border-line ps-4">
          {events.slice().reverse().map((e) => (
            <li key={e.id} className="relative text-sm">
              <span aria-hidden="true" className="absolute -start-[1.3rem] top-1.5 size-2 rounded-full bg-gold-fill" />
              <p>{evText(e)}</p>
              {e.kind === "note" && <p className="mt-1 whitespace-pre-line rounded-md bg-surface-2 px-3 py-2">{e.text}</p>}
              <p className="text-xs text-muted">{when(e.at)}</p>
            </li>
          ))}
        </ol>
        {manage && <div className="mt-5 max-w-lg"><DealNote id={d.id} /></div>}
      </Card>
      <p className="text-xs text-muted">{manage ? t("noteDeal") : t("noteDealInvestor")}</p>
    </div>
  );
}
