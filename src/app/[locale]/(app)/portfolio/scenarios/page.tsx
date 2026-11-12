import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageContext } from "@/lib/page";
import { can } from "@/lib/permissions";
import { SAMPLE_FX_EGP_PER_USD } from "@/lib/assumptions";
import { getScenarioSet, listScenarios, listScenarioSets, runScenarioForUser } from "@/lib/scenario-service";
import { PageHeader } from "@/components/ui";
import { SampleBadge } from "@/components/fig";
import { NoAccess } from "@/components/no-access";
import { ScenarioWorkbench } from "@/components/scenario/workbench";
import { Link } from "@/i18n/navigation";

export default async function Scenarios({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, currency, denied } = await pageContext("portfolio");
  if (denied) return <NoAccess role={user.role} />;
  const t = await getTranslations("scn");
  const p = await getTranslations("pf");
  const sets = await listScenarioSets();
  const latest = (await getScenarioSet(null))!;
  const first = await runScenarioForUser(user, { ...latest.payload.base }, sets[0].id);
  if (!first.ok) return <NoAccess role={user.role} />;
  const saved = await listScenarios(user);
  return (
    <div>
      <Link href="/portfolio" className="mb-3 inline-block text-sm text-gold underline underline-offset-4">{p("title")}</Link>
      <PageHeader title={t("title")} lead={t("lead")}><SampleBadge /></PageHeader>
      <ScenarioWorkbench initial={first} sets={sets} saved={saved} canSave={can(user.role, "scenario.save")} currency={currency} fx={SAMPLE_FX_EGP_PER_USD} />
    </div>
  );
}
