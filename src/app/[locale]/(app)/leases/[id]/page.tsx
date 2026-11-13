import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { pageContext } from "@/lib/page";
import { getTenant } from "@/lib/leasing";
import { DEMO_TODAY, SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { dateFmt, int, listSep, money } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { RecordPayment, RenewalEditor, SendReminder } from "@/components/leasing/controls";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: /^T-\d{3}$/.test(id) ? id : "Tenant" };
}
const STAGE_TONE = { not_started: "muted", offered: "gold", negotiating: "gold", agreed: "ok", leaving: "danger" } as const;
const INV_TONE = { paid: "ok", partial: "gold", open: "danger" } as const;

export default async function TenantPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("leases");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("lease");
  const data = await getTenant(user, id);
  if (!data) notFound();
  const { tenant: x, invoices, payments } = data;
  const ar = locale === "ar";
  const M = (egp: number) => money(egp, currency, locale, { fx: SAMPLE_FX_EGP_PER_USD });
  const rentText = (n: number, cur: string) => `${cur === "USD" ? "USD" : ar ? "جنيه" : "EGP"} ${int(n, locale)}`;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/leases#tenants" className="tap mb-3 inline-block text-sm text-gold underline underline-offset-4">{t("title")}</Link>
        <PageHeader title={ar ? x.nameAr : x.name} lead={`${x.sector}${listSep(locale)}${t("leasesN", { n: x.leases.length })}`}>
          {x.arrearsEgp !== null && (x.arrearsEgp > 0 ? <Badge tone="danger">{t("arrearsBadge", { amount: money(x.arrearsEgp, currency, locale, { fx: SAMPLE_FX_EGP_PER_USD, compact: true }), days: x.oldestOverdueDays ?? 0 })}</Badge> : <Badge tone="ok">{t("upToDate")}</Badge>)}
        </PageHeader>
      </div>

      {x.contact && (
        <Card>
          <h2 className="mb-2 font-display text-xl">{t("contact")}</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-muted">{t("contactName")}</dt><dd>{ar ? x.contact.nameAr : x.contact.name}</dd></div>
            <div><dt className="text-muted">{t("email")}</dt><dd><bdi>{x.contact.email}</bdi></dd></div>
            <div><dt className="text-muted">{t("phone")}</dt><dd><bdi>{x.contact.phone}</bdi></dd></div>
          </dl>
        </Card>
      )}

      <section aria-labelledby="ls-h">
        <h2 id="ls-h" className="mb-3 font-display text-2xl">{t("leasesTitle")}</h2>
        <ul className="space-y-3">
          {x.leases.map((l) => (
            <li key={l.id}>
              <Card className="flex flex-wrap items-start justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <p><span className="num font-semibold text-gold">{l.id}</span> <Link href={`/asset/${l.assetId}`} className="underline decoration-line underline-offset-4 hover:decoration-gold">{ar ? l.assetNameAr : l.assetName}</Link></p>
                  <p className="text-muted">{t("term", { start: dateFmt(l.startDate, locale), end: dateFmt(l.endDate, locale) })}{listSep(locale)}{l.daysLeft >= 0 ? t("daysLeft", { n: l.daysLeft }) : t("ended")}</p>
                  {l.monthlyRent !== null && <p className="mt-0.5">{t("rentNow", { rent: rentText(l.monthlyRent, l.currency) })}</p>}
                  {l.renewal && <p className="mt-1 flex flex-wrap items-center gap-2"><Badge tone={STAGE_TONE[l.renewal.status]}>{t(`st_${l.renewal.status}`)}</Badge>{l.renewal.proposedRent ? <span>{t("rentProposedShort", { rent: rentText(l.renewal.proposedRent, l.currency) })}</span> : null}</p>}
                </div>
                {x.contact && l.daysLeft >= 0 && <RenewalEditor leaseId={l.id} title={`${l.id}, ${ar ? l.assetNameAr : l.assetName}`} currency={l.currency} endDate={l.endDate} current={l.renewal} />}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {invoices.length > 0 && (
        <section aria-labelledby="iv-h">
          <h2 id="iv-h" className="mb-3 font-display text-2xl">{t("invoicesTitle")}</h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {invoices.map((i) => {
              const owed = i.amountEgp - i.paidEgp;
              const overdue = owed > 0 && i.dueOn < DEMO_TODAY;
              return (
                <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2"><span className="font-semibold">{dateFmt(i.period, locale).replace(/^\d+\s/, "")}</span><Badge tone={INV_TONE[i.status as "paid"]}>{t(`inv_${i.status}`)}</Badge><span className="num text-xs text-muted">{i.leaseId}</span></p>
                    <p className="text-muted">{t("billed", { amount: M(i.amountEgp) })}{i.paidEgp > 0 ? `${listSep(locale)}${t("received", { amount: M(i.paidEgp) })}` : ""}{listSep(locale)}{t("dueOn", { date: dateFmt(i.dueOn, locale) })}</p>
                    {payments.filter((p) => p.invoiceId === i.id).map((p) => <p key={p.id} className="text-xs text-muted">{t("paymentLine", { amount: M(p.amountEgp), date: dateFmt(p.paidOn, locale), method: t(`m_${p.method}` as "m_transfer") })}</p>)}
                  </div>
                  {owed > 0 && (
                    <div className="flex flex-wrap items-start gap-2">
                      <RecordPayment invoiceId={i.id} outstandingEgp={owed} period={i.period} today={DEMO_TODAY} title={`${ar ? x.nameAr : x.name}, ${i.period.slice(0, 7)}`} />
                      {overdue && <SendReminder invoiceId={i.id} lastReminderOn={i.lastReminderOn} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
