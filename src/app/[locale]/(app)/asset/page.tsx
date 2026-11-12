import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { getPortfolio } from "@/lib/access";
import { money } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { Card, PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";

export default async function AssetIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("asset");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("asset");
  const ty = await getTranslations("types");
  const rows = (await getPortfolio(user)).sort((a, b) => a.id.localeCompare(b.id));
  const ar = locale === "ar";
  return (
    <div>
      <PageHeader animated title={t("title")} lead={t("lead")}><Link href="/asset/documents" className="text-sm text-gold underline underline-offset-4">{(await getTranslations("docs"))("title")}</Link></PageHeader>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/asset/${r.id}`} className="block rounded-lg focus-visible:outline-offset-4">
              <Card className="h-full p-4 transition-colors hover:bg-surface-2">
                <p className="num text-xs text-muted">{r.id}</p>
                <p className="font-semibold text-gold">{ar ? r.nameAr : r.name}</p>
                <p className="text-xs text-muted">{ar ? r.district.nameAr : r.district.name} · {ty(r.type as "villa")}</p>
                <p className="mt-2 font-display text-lg"><bdi>{money(r.valueEgp, currency, locale, { compact: true })}</bdi></p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
