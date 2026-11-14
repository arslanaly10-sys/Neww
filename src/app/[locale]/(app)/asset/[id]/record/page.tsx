import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Building2, CalendarDays, FileText, Handshake, KeyRound, Receipt, Scale, Wrench } from "lucide-react";
import { pageContext } from "@/lib/page";
import { getAssetRecord } from "@/lib/asset-record";
import { can } from "@/lib/permissions";
import { dateFmt, int, listSep, money, pct } from "@/lib/format";
import { SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Badge, Card, PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { HashTabs } from "@/components/hash-tabs";
import { EditAsset, FactReview, PayInstallment } from "@/components/record/controls";
import { GrowBar, Stagger, StaggerItem } from "@/components/motion";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: /^A-\d{3}$/.test(id) ? `${id} record` : "Asset record" };
}

export default async function AssetRecordPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("asset");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("record");
  const ty = await getTranslations("types");
  const fi = await getTranslations("finish");
  const st = await getTranslations("status");
  const ds = await getTranslations("docStatus");
  const r = await getAssetRecord(user, id);
  if (!r) notFound();
  const a = r.asset;
  const ar = locale === "ar";
  const M = (n: number) => money(n, currency, locale, { fx: SAMPLE_FX_EGP_PER_USD });
  const edit = can(user.role, "records.edit");
  const verify = can(user.role, "records.verify");
  const factValue = (field: string, v: string) => {
    if (field === "value_egp") return M(Number(v));
    if (field.endsWith("sqm")) return `${int(Number(v), locale)} m²`;
    if (field === "finish") return fi(v as "luxury");
    if (field === "occupancy") return st(v as "let");
    if (field === "status") return t(`as_${v}` as "as_ready");
    if (field === "title_status") return ds.has(v) ? ds(v as "verified") : v;
    if (field === "permitted_use") return t.has(`use_${v}`) ? t(`use_${v}` as "use_residential") : v;
    return v;
  };
  const tone = (s: string) => (s === "verified" ? "ok" : s === "disputed" ? "danger" : "muted") as "ok" | "danger" | "muted";
  const linkCards = [
    { icon: KeyRound, n: r.links.leases, label: t("lk_leases"), href: "/leases" },
    { icon: FileText, n: r.links.documents, label: t("lk_documents"), href: `/asset/${a.id}#docs` },
    { icon: Scale, n: r.links.valuations, label: t("lk_valuations"), href: `/valuation?asset=${a.id}` },
    { icon: Wrench, n: r.links.work, label: t("lk_work"), href: `/maintenance?asset=${a.id}` },
    { icon: CalendarDays, n: r.links.events, label: t("lk_events"), href: "/calendar" },
    { icon: Handshake, n: r.links.deals, label: t("lk_deals"), href: "/deals" },
    ...(r.links.expenses !== null ? [{ icon: Receipt, n: r.links.expenses, label: t("lk_expenses"), href: "/finance#ledger" }] : []),
  ];

  const identity = (
    <section aria-labelledby="id-h" className="space-y-5">
      <h2 id="id-h" className="font-display text-2xl">{t("identity")}</h2>
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-muted">{t("stableId")}</dt><dd><span className="num text-lg font-semibold text-gold">{a.id}</span><span className="block text-xs text-muted">{t("stableIdHelp")}</span></dd></div>
        <div><dt className="text-muted">{t("portfolio")}</dt><dd>{r.portfolio ? (ar ? r.portfolio.nameAr : r.portfolio.name) : "–"}</dd></div>
        <div><dt className="text-muted">{t("fStatus")}</dt><dd>{t(`as_${a.status}` as "as_ready")}{a.deliveryOn ? `${listSep(locale)}${t("deliveryOn", { date: dateFmt(a.deliveryOn, locale) })}` : ""}</dd></div>
        <div><dt className="text-muted">{t("version")}</dt><dd><span className="num">v{r.versions[0]?.version ?? 1}</span>{listSep(locale)}{t("verifiedShare", { n: r.verified, total: r.factCount })}</dd></div>
      </dl>
      <div>
        <h3 className="mb-2 font-semibold">{t("ownership")}</h3>
        <ul className="space-y-2" aria-label={t("ownership")}>
          {r.owners.map((o, i) => (
            <li key={o.id}>
              <div className="mb-1 flex justify-between gap-3 text-sm"><span>{ar ? o.holderAr : o.holder}</span><span className="num">{pct(o.sharePct / 100, locale, 0)}</span></div>
              <div className="h-2 rounded-full bg-surface-2" role="img" aria-label={`${ar ? o.holderAr : o.holder}: ${pct(o.sharePct / 100, locale, 0)}`}><GrowBar className="h-2 rounded-full bg-gold-fill" width={`${o.sharePct}%`} rtl={ar} delay={0.1 + i * 0.08} /></div>
              <p className="mt-0.5 text-xs text-muted">{t("since", { date: dateFmt(o.since, locale) })}{o.sourceDocId ? `${listSep(locale)}${t("perDoc", { id: o.sourceDocId })}` : ""}</p>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 font-semibold">{t("linked")}</h3>
        <Stagger as="ul" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-label={t("linked")}>
          {linkCards.map((c) => (
            <StaggerItem key={c.label} as="li">
              <Link href={c.href} className="flex min-h-14 items-center gap-3 rounded-lg border border-line px-3 hover:border-gold-fill">
                <c.icon aria-hidden="true" size={18} className="text-gold" /><span className="flex-1 text-sm">{c.label}</span><span className="num font-semibold">{c.n}</span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
      {edit && <EditAsset id={a.id} v={{ name: a.name, nameAr: a.nameAr, areaSqm: a.areaSqm, plotAreaSqm: a.plotAreaSqm, floor: a.floor, finish: a.finish, yearBuilt: a.yearBuilt, occupancy: a.occupancy, status: a.status, deliveryOn: a.deliveryOn }} />}
    </section>
  );

  const structure = (
    <section aria-labelledby="st-h" className="space-y-4">
      <h2 id="st-h" className="font-display text-2xl">{t("structure")}</h2>
      {r.buildings.length === 0 ? <p className="text-sm text-muted">{t("noBuildings", { area: int(a.plotAreaSqm ?? a.areaSqm, locale) })}</p> : r.buildings.map((b) => (
        <div key={b.id} className="rounded-lg border border-line">
          <p className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-sm"><Building2 aria-hidden="true" size={16} className="text-gold" /><span className="font-semibold">{ar ? b.nameAr : b.name}</span><span className="num text-muted">{b.id}</span><span className="text-muted">{t("floors", { n: b.floors ?? 0 })}{b.yearBuilt ? `${listSep(locale)}${t("built", { year: b.yearBuilt })}` : ""}</span></p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">{t("unitsOf", { name: ar ? b.nameAr : b.name })}</caption>
              <thead><tr className="text-xs text-muted">{["uUnit", "uUse", "uArea", "uFloor", "uRooms", "uStatus"].map((h, i) => <th key={h} scope="col" className={cn("px-4 py-2 font-semibold", i === 2 ? "text-end" : "text-start")}>{t(h)}</th>)}</tr></thead>
              <tbody>
                {r.units.filter((u) => u.buildingId === b.id).map((u) => (
                  <tr key={u.id} className="border-t border-line">
                    <th scope="row" className="px-4 py-2 text-start font-normal"><span className="num">{u.id}</span><span className="text-muted">{listSep(locale)}{u.label}</span></th>
                    <td className="px-4 py-2">{t(`use_${u.use}` as "use_residential")}</td>
                    <td className="px-4 py-2 text-end"><span className="num">{int(u.areaSqm, locale)} m²</span></td>
                    <td className="px-4 py-2"><span className="num">{u.floor ?? "–"}</span></td>
                    <td className="px-4 py-2">{u.beds ? t("rooms", { beds: u.beds, baths: u.baths ?? 0 }) : "–"}</td>
                    <td className="px-4 py-2">{st(u.status as "let")}{u.tenant ? <span className="text-muted">{listSep(locale)}{ar ? u.tenantAr : u.tenant}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );

  const facts = (
    <section aria-labelledby="fa-h" className="space-y-3">
      <h2 id="fa-h" className="font-display text-2xl">{t("facts")}</h2>
      <p className="max-w-2xl text-sm text-muted">{t("factsLead")}</p>
      <ul aria-label={t("facts")} className="divide-y divide-line rounded-lg border border-line">
        {r.facts.map((f) => (
          <li key={f.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[12rem_minmax(0,1fr)_auto] md:items-center">
            <div><p className="text-muted">{t(`f_${f.field}` as "f_area_sqm")}</p><p className="font-semibold">{factValue(f.field, f.value)}</p></div>
            <div className="min-w-0">
              <p>{f.sourceLabel}<span className="text-muted">{listSep(locale)}{t(`src_${f.sourceKind}` as "src_document")}{listSep(locale)}{t("observed", { date: dateFmt(f.observedOn, locale) })}</span></p>
              <p className="text-xs text-muted">{t("recordedBy", { name: ar ? f.recordedByNameAr : f.recordedByName })}{f.reviewedByName ? `${listSep(locale)}${t(f.status === "disputed" ? "disputedBy" : "verifiedBy", { name: ar ? f.reviewedByNameAr! : f.reviewedByName })}` : ""}{f.reviewNote ? `: ${f.reviewNote}` : ""}</p>
              {f.earlier.length > 0 && <p className="text-xs text-muted">{t("earlier", { list: f.earlier.map((e) => `${factValue(f.field, e.value)} (${dateFmt(e.observedOn, locale)})`).join(listSep(locale)) })}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end"><Badge tone={tone(f.status)}>{t(`fs_${f.status}` as "fs_verified")}</Badge>{verify && f.status !== "verified" && <FactReview id={f.id} label={t(`f_${f.field}` as "f_area_sqm")} />}</div>
          </li>
        ))}
      </ul>
    </section>
  );

  const history = (
    <section aria-labelledby="hi-h" className="space-y-3">
      <h2 id="hi-h" className="font-display text-2xl">{t("history")}</h2>
      <p className="max-w-2xl text-sm text-muted">{t("historyLead")}</p>
      <Stagger as="ul" className="space-y-3 border-s border-line ps-5" aria-label={t("history")}>
        {r.versions.map((v) => (
          <StaggerItem key={v.id} as="li" className="relative">
            <span aria-hidden="true" className="absolute -start-[1.65rem] top-1.5 size-2.5 rounded-full bg-gold-fill" />
            <p className="text-sm"><span className="num font-semibold">v{v.version}</span>{listSep(locale)}{dateFmt(v.at.toISOString().slice(0, 10), locale)}{listSep(locale)}{ar ? v.actorNameAr : v.actorName}</p>
            <p className="text-sm">{v.reason}</p>
            <p className="text-xs text-muted">{(v.changed as string[]).length ? t("changedFields", { list: (v.changed as string[]).map((c) => t(`c_${c}` as "c_name")).join(listSep(locale)) }) : t("firstVersion")}. {t("evidenceIs", { src: `${t(`src_${v.sourceKind}` as "src_document")}${v.sourceRef ? ` ${v.sourceRef}` : ""}` })}</p>
          </StaggerItem>
        ))}
      </Stagger>
      <p className="text-sm"><Link href={`/asset/${a.id}`} className="text-gold underline underline-offset-4">{t("valueHistoryLink")}</Link></p>
    </section>
  );

  const plan = r.planTotals && (
    <section aria-labelledby="pl-h" className="space-y-3">
      <h2 id="pl-h" className="font-display text-2xl">{t("plan")}</h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-muted">{t("planTotal")}</dt><dd className="num text-lg">{M(r.planTotals.total)}</dd></div>
        <div><dt className="text-muted">{t("planPaid")}</dt><dd className="num text-lg text-ok">{M(r.planTotals.paid)}</dd></div>
        <div><dt className="text-muted">{t("planOutstanding")}</dt><dd className="num text-lg">{M(r.planTotals.outstanding)}</dd></div>
        <div><dt className="text-muted">{t("planNext")}</dt><dd>{r.planTotals.next ? <><span className="num">{M(r.planTotals.next.amountEgp)}</span> {dateFmt(r.planTotals.next.dueOn, locale)}</> : "–"}</dd></div>
      </dl>
      <div className="h-2 rounded-full bg-surface-2" role="img" aria-label={t("planProgress", { pct: pct(r.planTotals.paid / r.planTotals.total, locale, 0) })}><GrowBar className="h-2 rounded-full bg-ok" width={`${(r.planTotals.paid / r.planTotals.total) * 100}%`} rtl={ar} /></div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[30rem] text-sm">
          <caption className="sr-only">{t("plan")}</caption>
          <thead><tr className="text-xs text-muted"><th scope="col" className="px-4 py-2 text-start font-semibold">#</th><th scope="col" className="px-4 py-2 text-start font-semibold">{t("due")}</th><th scope="col" className="px-4 py-2 text-end font-semibold">{t("amount")}</th><th scope="col" className="px-4 py-2 text-start font-semibold">{t("state")}</th></tr></thead>
          <tbody>
            {r.plan.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-2"><span className="num">{p.seq}</span></td>
                <td className="px-4 py-2">{dateFmt(p.dueOn, locale)}</td>
                <td className="px-4 py-2 text-end"><span className="num">{M(p.amountEgp)}</span></td>
                <td className={cn("px-4 py-2", p.state === "overdue" && "text-danger", p.state === "paid" && "text-ok")}>{t(`ps_${p.state}` as "ps_paid")}{p.paidOn ? ` ${dateFmt(p.paidOn, locale)}` : ""}{edit && !p.paidOn && <> <PayInstallment id={p.id} seq={p.seq} /></>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/asset/${a.id}`} className="tap mb-3 inline-block text-sm text-gold underline underline-offset-4">{ar ? a.nameAr : a.name}</Link>
        <PageHeader title={t("title", { id: a.id })} lead={`${ar ? a.nameAr : a.name}${listSep(locale)}${ty(a.type as "villa")}`}>
          <Badge tone={r.verified === r.factCount ? "ok" : "gold"}>{t("verifiedShare", { n: r.verified, total: r.factCount })}</Badge>
        </PageHeader>
      </div>
      <Card>
        <HashTabs label={t("title", { id: a.id })} tabs={[
          { id: "identity", label: t("tabIdentity"), content: identity },
          { id: "structure", label: t("tabStructure"), count: r.units.length, content: structure },
          { id: "facts", label: t("tabFacts"), count: r.factCount - r.verified, content: facts },
          { id: "history", label: t("tabHistory"), count: r.versions.length, content: history },
          ...(plan ? [{ id: "plan", label: t("tabPlan"), content: plan }] : []),
        ]} />
      </Card>
      <p className="text-xs text-muted">{t("note")}</p>
    </div>
  );
}
