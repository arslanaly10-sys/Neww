import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCircle2, MinusCircle } from "lucide-react";
import { pageContext } from "@/lib/page";
import { getMe, LANDINGS } from "@/lib/users";
import { AREA_ACCESS, PERMISSIONS, type Permission } from "@/lib/permissions";
import { Link } from "@/i18n/navigation";
import { Card, PageHeader } from "@/components/ui";
import { HashTabs } from "@/components/hash-tabs";
import { PrefsForm, ProfileForm } from "@/components/settings/forms";
import { BrandEye } from "@/components/brand";
import { titleFrom } from "@/lib/meta";

export const generateMetadata = titleFrom("settings");

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, currency } = await pageContext("settings");
  const t = await getTranslations("settings");
  const nav = await getTranslations("nav");
  const g = await getTranslations("governance");
  const r = await getTranslations("roles");
  const me = (await getMe(user))!;
  const ar = locale === "ar";
  const landings = LANDINGS.filter((l) => AREA_ACCESS[l].includes(user.role)).map((l) => ({ id: l, label: nav(l) }));
  const perms = (Object.keys(PERMISSIONS) as Permission[]).map((p) => ({ p, yes: PERMISSIONS[p][user.role], label: g.has(`perm.${p.replace(/\./g, "_")}`) ? g(`perm.${p.replace(/\./g, "_")}` as "perm.work_manage") : p }));

  const profile = (
    <section aria-labelledby="pf-h" className="space-y-4">
      <div className="flex items-center gap-4">
        <span className="grid size-16 place-items-center rounded-full border border-gold-fill/60 bg-surface-2 font-display text-2xl text-gold">{(ar ? me.nameAr : me.name).slice(0, 1)}</span>
        <div><h2 id="pf-h" className="font-display text-2xl">{ar ? me.nameAr : me.name}</h2><p className="text-sm text-muted">{r(me.role)}, <span className="num">{me.email}</span></p></div>
      </div>
      <ProfileForm v={{ name: me.name, nameAr: me.nameAr, title: me.title, titleAr: me.titleAr }} />
    </section>
  );
  const prefs = (
    <section aria-labelledby="pr-h" className="space-y-3">
      <h2 id="pr-h" className="font-display text-2xl">{t("prefsTitle")}</h2>
      <PrefsForm v={{ lang: me.prefs.lang ?? (ar ? "ar" : "en"), currency: me.prefs.currency ?? currency, theme: me.prefs.theme ?? "system", landing: me.prefs.landing ?? "overview" }} landings={landings} />
      <p className="text-sm"><Link href="/notifications#settings" className="text-gold underline underline-offset-4">{t("notifLink")}</Link></p>
    </section>
  );
  const access = (
    <section aria-labelledby="ac-h" className="space-y-3">
      <h2 id="ac-h" className="font-display text-2xl">{t("accessTitle", { role: r(me.role) })}</h2>
      <p className="max-w-xl text-sm text-muted">{t("accessLead")}</p>
      <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {perms.map((x) => (
          <li key={x.p} className="flex min-h-9 items-center gap-2 text-sm">
            {x.yes ? <CheckCircle2 aria-hidden="true" size={16} className="shrink-0 text-ok" /> : <MinusCircle aria-hidden="true" size={16} className="shrink-0 text-muted" />}
            <span className={x.yes ? "" : "text-muted"}>{x.label}<span className="sr-only">: {x.yes ? t("yes") : t("no")}</span></span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{t("accessNote")}</p>
    </section>
  );

  return (
    <div>
      <PageHeader animated title={t("title")} lead={t("lead")}><BrandEye size={56} className="hidden sm:block" /></PageHeader>
      <Card><HashTabs label={t("title")} tabs={[{ id: "profile", label: t("tabProfile"), content: profile }, { id: "preferences", label: t("tabPrefs"), content: prefs }, { id: "access", label: t("tabAccess"), content: access }]} /></Card>
    </div>
  );
}
