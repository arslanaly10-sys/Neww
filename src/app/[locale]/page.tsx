import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { asc, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { signIn } from "@/app/actions";
import { Wordmark, HorusGlyph } from "@/components/brand";
import { Card, buttonStyles } from "@/components/ui";
import { LangToggle } from "@/components/shell/controls";
import { cn } from "@/lib/cn";
import { DEMO_TODAY } from "@/lib/assumptions";
import { dateFmt } from "@/lib/format";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await getCurrentUser()) redirect({ href: "/overview", locale });
  const t = await getTranslations("login");
  const b = await getTranslations("brand");
  const s = await getTranslations("sample");
  const r = await getTranslations("roles");
  const db = await getDb();
  const all = await db.select().from(users).orderBy(asc(sql`case role when 'investor' then 1 when 'manager' then 2 else 3 end`), asc(users.id));
  const ar = locale === "ar";
  return (
    <div className="flex min-h-dvh flex-col">
      <div role="note" className="bg-gold-fill px-4 py-1.5 text-center text-xs font-semibold text-on-gold">{s("ribbon")}</div>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Wordmark />
        <LangToggle />
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-6 md:pt-14">
        <p className="mb-3 flex items-center gap-2 text-sm text-gold"><HorusGlyph size={18} />{b("triad")}</p>
        <h1 className="font-display text-4xl leading-tight md:text-6xl">{b("tagline")}</h1>
        <p className="mt-4 max-w-xl text-lg text-muted">{b("valueLine")}. {b("aiLine")}.</p>
        <h2 className="mb-1 mt-12 font-display text-2xl">{t("title")}</h2>
        <p className="mb-6 max-w-xl text-muted">{t("sub")}</p>
        <div className="grid gap-4 md:grid-cols-3">
          {(["investor", "manager", "admin"] as const).map((role) => {
            const group = all.filter((u) => u.role === role);
            return (
              <Card key={role} className="flex flex-col">
                <h3 className="font-display text-xl text-gold">{r(role)}</h3>
                <p className="mb-4 mt-1 flex-1 text-sm text-muted">{t(`${role}Desc` as "investorDesc")}</p>
                <div className="flex flex-col gap-2">
                  {group.map((u) => (
                    <form key={u.id} action={signIn.bind(null, u.id, locale)}>
                      <button type="submit" className={cn(buttonStyles({ variant: role === "manager" && u.id === "u-manager-1" ? "gold" : "outline" }), "w-full")}>
                        {t("enter", { name: ar ? u.nameAr : u.name })}
                      </button>
                    </form>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
        <p className="mt-8 text-xs text-muted">{s("asOf", { date: dateFmt(DEMO_TODAY, locale) })}. {s("footer")}</p>
      </main>
    </div>
  );
}
