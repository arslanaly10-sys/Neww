import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertTriangle, CalendarClock, FileWarning } from "lucide-react";
import { pageContext } from "@/lib/page";
import { can } from "@/lib/permissions";
import { getDocumentFlags, type DocFlag } from "@/lib/docs/service";
import { dateFmt } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SampleBadge } from "@/components/fig";
import { NoAccess } from "@/components/no-access";
import { Reader } from "@/components/docs/reader";

export default async function Documents({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, denied } = await pageContext("asset");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("docs");
  const dk = await getTranslations("docKind");
  const ar = locale === "ar";
  const { flags, counts } = await getDocumentFlags(user);
  const order: DocFlag["kind"][] = ["missing", "expired", "lease_ending", "doc_expiring", "pending"];
  const tone = { missing: "danger", expired: "danger", lease_ending: "gold", doc_expiring: "gold", pending: "muted" } as const;
  const Icon = { missing: FileWarning, expired: AlertTriangle, lease_ending: CalendarClock, doc_expiring: CalendarClock, pending: FileWarning } as const;

  const text = (f: DocFlag) => {
    const kind = dk(f.label as "lease"), asset = ar ? f.assetNameAr : f.assetName;
    switch (f.kind) {
      case "missing": return t("flagMissing", { kind, asset });
      case "expired": return t("flagExpired", { kind, asset });
      case "pending": return t("flagPending", { kind, asset });
      case "lease_ending": return t("flagLease", { asset, date: dateFmt(f.date!, locale) });
      default: return t("flagDoc", { kind, asset, date: dateFmt(f.date!, locale) });
    }
  };
  const when = (f: DocFlag) => (f.days === null ? "" : f.days >= 0 ? t("inDays", { n: f.days }) : t("agoDays", { n: -f.days }));

  return (
    <div className="space-y-8">
      <Link href="/asset" className="tap inline-block text-sm text-gold underline underline-offset-4">{(await getTranslations("asset"))("back")}</Link>
      <PageHeader animated title={t("title")} lead={t("lead")}><SampleBadge /></PageHeader>

      <section aria-labelledby="flags">
        <h2 id="flags" className="mb-3 font-display text-2xl">{t("flagsTitle")}</h2>
        <ul className="mb-4 flex flex-wrap gap-2">
          {order.map((k) => <li key={k}><Badge tone={tone[k]} className="normal-case">{t(k)}: <bdi>{counts[k]}</bdi></Badge></li>)}
        </ul>
        {flags.length === 0 ? <Card className="text-sm text-muted">{t("noFlags")}</Card> : (
          <ul className="grid gap-2 md:grid-cols-2">
            {flags.map((f, i) => {
              const I = Icon[f.kind];
              return (
                <li key={`${f.kind}-${f.docId}-${i}`}>
                  <Card className="flex items-start gap-3 p-3.5 text-sm">
                    <I aria-hidden="true" size={18} className={f.kind === "missing" || f.kind === "expired" ? "mt-0.5 shrink-0 text-danger" : "mt-0.5 shrink-0 text-gold"} />
                    <div className="min-w-0 flex-1">
                      <p>{text(f)}</p>
                      <p className="mt-0.5 text-xs text-muted">{when(f)}{when(f) ? " · " : ""}<Link href={`/asset/${f.assetId}`} className="tap text-gold underline underline-offset-4">{t("openAsset")}</Link></p>
                    </div>
                    <Badge tone={tone[f.kind]} className="shrink-0 normal-case">{t(f.kind)}</Badge>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="reader">
        <h2 id="reader" className="sr-only">{t("dropTitle")}</h2>
        {can(user.role, "document.confirm_extraction") ? <Reader /> : <Card className="text-sm text-muted">{t("investorNote")}</Card>}
      </section>
    </div>
  );
}
