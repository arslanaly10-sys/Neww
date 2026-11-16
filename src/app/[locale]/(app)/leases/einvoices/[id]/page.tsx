import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { CheckCircle2, AlertTriangle, XCircle, Download } from "lucide-react";
import { pageContext } from "@/lib/page";
import { buildEInvoice, ISSUER } from "@/lib/einvoice";
import { dateFmt } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Badge, Card, PageHeader, buttonStyles } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { titleFrom } from "@/lib/meta";
import { eInvoiceState, SUBMISSION_BLOCKERS } from "@/lib/einvoice-sign";
import { Signing } from "@/components/einvoice/signing";

export const generateMetadata = titleFrom("einv", "title");
const n5 = (x: number) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 });

export default async function EInvoicePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user, denied } = await pageContext("leases");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("einv");
  const r = await buildEInvoice(user, id);
  if (!r) notFound();
  const { doc, checks } = r;
  const es = (await eInvoiceState(user, r.invoice.id))!;
  const cur = es.current;
  const ar = locale === "ar";
  const stamp = (d: Date | null) => (d ? d.toLocaleString(ar ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" }) : null);
  const line = doc.invoiceLines[0];
  const errors = checks.filter((c) => !c.ok && c.level === "error").length;
  const warnings = checks.filter((c) => !c.ok && c.level === "warning").length;
  const rows: [string, string][] = [
    [t("documentType"), `${doc.documentType} (${doc.documentTypeVersion})`], [t("issued"), dateFmt(doc.dateTimeIssued, locale)], [t("internalId"), doc.internalID],
    [t("issuer"), `${ISSUER.name}, ${doc.issuer.id}`], [t("activity"), doc.taxpayerActivityCode], [t("receiver"), `${doc.receiver.name}${doc.receiver.id ? `, ${doc.receiver.id}` : ""}`],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/leases/einvoices" className="tap mb-3 inline-block text-sm text-gold underline underline-offset-4">{t("title")}</Link>
        <PageHeader title={t("draftFor", { id: r.invoice.id })} lead={t("detailLead")}>
          <span className="flex flex-wrap items-center gap-2">
            {r.ready ? <Badge tone="ok">{t("ready")}</Badge> : errors ? <Badge tone="danger">{t("nErrors", { n: errors })}</Badge> : <Badge tone="gold">{t("nWarnings", { n: warnings })}</Badge>}
            <a href={`/api/einvoice/${r.invoice.id}`} download className={buttonStyles({ variant: "outline", size: "sm" })}><Download aria-hidden="true" size={14} />{t("download")}</a>
          </span>
        </PageHeader>
      </div>
      <p className="max-w-2xl rounded-lg border border-gold/50 bg-gold-fill/10 p-3 text-sm">{t("draftOnly")}</p>
      <section aria-labelledby="sg-h" className="space-y-3">
        <h2 id="sg-h" className="font-display text-2xl">{t("signing")}</h2>
        <Card>
          <Signing invoiceId={r.invoice.id} me={user.id} hasErrors={errors > 0} blockers={[...SUBMISSION_BLOCKERS]} when={{ approved: stamp(cur?.approvedAt ?? null), signed: stamp(cur?.signedAt ?? null) }}
            state={cur ? { id: cur.id, status: cur.status, approvedBy: cur.approvedBy, approverName: (ar ? cur.approver?.nameAr : cur.approver?.name) ?? cur.approvedBy, signerName: cur.signer ? (ar ? cur.signer.nameAr : cur.signer.name) : null, approvedAt: cur.approvedAt.toISOString(), signedAt: cur.signedAt?.toISOString() ?? null, keyId: cur.keyId, hash: cur.canonicalHash } : null} />
          <p className="mt-4 text-xs text-muted">{t("testKeyNote")}</p>
          {es.voided.length > 0 && <p className="mt-2 text-xs text-muted">{t("voidedList", { list: es.voided.map((v) => `${v.id} (${v.voidReason})`).join(ar ? "، " : ", ") })}</p>}
        </Card>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="ck-h">
          <h2 id="ck-h" className="mb-3 font-display text-2xl">{t("checks")}</h2>
          <ul className="space-y-2 text-sm">
            {checks.map((c) => {
              const Icon = c.ok ? CheckCircle2 : c.level === "error" ? XCircle : AlertTriangle;
              return (
                <li key={c.id} className="flex items-start gap-2 rounded-lg border border-line bg-surface p-3">
                  <Icon aria-hidden="true" size={18} className={cn("mt-0.5 shrink-0", c.ok ? "text-ok" : c.level === "error" ? "text-danger" : "text-gold")} />
                  <span><span className="sr-only">{c.ok ? t("passed") : c.level === "error" ? t("failedError") : t("failedWarning")}: </span><strong>{t(`c_${c.id}`, c.params ?? {})}</strong><span className="block text-muted">{c.id === "signature" && cur?.status === "signed" ? t("no_signature_test", { key: cur.keyId ?? "" }) : t(c.ok ? `ok_${c.id}` : `no_${c.id}`, c.params ?? {})}</span></span>
                </li>
              );
            })}
          </ul>
        </section>
        <section aria-labelledby="doc-h" className="space-y-4">
          <h2 id="doc-h" className="font-display text-2xl">{t("document")}</h2>
          <Card>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">{rows.map(([k, v]) => <div key={k}><dt className="text-muted">{k}</dt><dd dir="auto">{v}</dd></div>)}</dl>
          </Card>
          <Card className="space-y-2 text-sm">
            <h3 className="font-semibold">{t("line")}</h3>
            <p dir="ltr" className="text-start">{line.description}</p>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><dt className="text-xs text-muted">{t("net")}</dt><dd className="num" dir="ltr">{n5(line.netTotal)}</dd></div>
              <div><dt className="text-xs text-muted">{t("taxLine", { rate: r.rate, sub: line.taxableItems[0].subType })}</dt><dd className="num" dir="ltr">{n5(line.taxableItems[0].amount)}</dd></div>
              <div><dt className="text-xs text-muted">{t("total")}</dt><dd className="num" dir="ltr">{n5(doc.totalAmount)}</dd></div>
              <div><dt className="text-xs text-muted">{t("currency")}</dt><dd dir="ltr">{line.unitValue.currencySold}{"currencyExchangeRate" in line.unitValue ? ` @ ${line.unitValue.currencyExchangeRate}` : ""}</dd></div>
            </dl>
          </Card>
          <details className="rounded-xl border border-line bg-surface p-4 text-sm">
            <summary className="min-h-10 cursor-pointer font-semibold">{t("json")}</summary>
            <pre dir="ltr" tabIndex={0} className="mt-3 max-h-96 overflow-auto rounded-md bg-surface-2 p-3 text-xs">{JSON.stringify(doc, null, 2)}</pre>
          </details>
        </section>
      </div>
    </div>
  );
}
