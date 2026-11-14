import { getTranslations, setRequestLocale } from "next-intl/server";
import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { districts } from "@/db/schema";
import { PublicShell } from "@/components/horus/public-shell";
import { HorusIntake } from "@/components/horus/intake";
import { BrandEye } from "@/components/brand";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("hv", "intakeTitle");

/** Public: the HORUS questionnaire. No sign-in, no documents. */
export default async function EvaluatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("hv");
  const ds = await (await getDb()).select({ id: districts.id, name: districts.name, nameAr: districts.nameAr }).from(districts).orderBy(asc(districts.name));
  return (
    <PublicShell>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div>
          <h1 className="font-display text-4xl md:text-5xl">{t("intakeTitle")}</h1>
          <p className="mt-3 max-w-xl text-muted">{t("intakeLead")}</p>
          <div className="mt-8 rounded-2xl border border-line bg-surface p-5 md:p-8"><HorusIntake districts={ds.map((d) => ({ id: d.id, name: locale === "ar" ? d.nameAr : d.name }))} /></div>
        </div>
        <aside className="hidden space-y-4 lg:block">
          <BrandEye size={200} className="opacity-90" />
          <ul className="space-y-3 text-sm text-muted">{["side1", "side2", "side3"].map((k) => <li key={k} className="border-s-2 border-gold-fill/60 ps-3">{t(k)}</li>)}</ul>
        </aside>
      </div>
    </PublicShell>
  );
}
