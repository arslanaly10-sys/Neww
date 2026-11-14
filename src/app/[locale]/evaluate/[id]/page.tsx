import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { districts } from "@/db/schema";
import { getIntakeResult } from "@/lib/horus-runs";
import { getCurrency } from "@/lib/session";
import { Link } from "@/i18n/navigation";
import { PublicShell } from "@/components/horus/public-shell";
import { HorusReport } from "@/components/horus/report";
import { KeepResult } from "@/components/horus/run-controls";

export async function generateMetadata() { return { title: "HORUS result", robots: { index: false, follow: false } }; }

/** Public: the illustrative result for one questionnaire, behind its unguessable id. */
export default async function EvaluateResultPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("hv");
  const r = await getIntakeResult(id);
  if (!r) notFound();
  const ds = await (await getDb()).select().from(districts);
  const name = (d: string) => (d === "other" ? t("otherRegion") : (locale === "ar" ? ds.find((x) => x.id === d)?.nameAr : ds.find((x) => x.id === d)?.name) ?? d);
  return (
    <PublicShell>
      <p className="text-sm text-gold">{t("resultKicker")}</p>
      <h1 className="mt-1 font-display text-4xl">{t("resultTitle", { type: t(`t_${r.answers.type}`), place: name(r.answers.districtId) })}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t("resultLead")}</p>
      <div className="mt-8 rounded-2xl border border-line bg-surface p-5 md:p-8">
        <HorusReport r={r.run.result} inputs={r.answers} status="illustrative" locale={locale} currency={await getCurrency()} districtName={name} publicView />
      </div>
      {r.run.result.missing.length > 0 && <p className="mt-6 text-sm text-muted">{t("resultMissing", { list: r.run.result.missing.map((m) => t(`q_${m}`)).join(locale === "ar" ? "، " : ", ") })} <Link href="/evaluate" className="text-gold underline underline-offset-4">{t("startAgain")}</Link></p>}
      <section aria-labelledby="keep-h" className="mt-10 rounded-2xl border border-gold-fill/50 bg-surface p-5 md:p-8">
        <h2 id="keep-h" className="font-display text-2xl">{t("keepTitle")}</h2>
        <p className="mb-5 mt-1 max-w-2xl text-sm text-muted">{t("keepLead")}</p>
        <KeepResult id={r.intake.id} />
      </section>
    </PublicShell>
  );
}
