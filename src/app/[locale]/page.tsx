import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { asc, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { signIn } from "@/app/actions";
import { Wordmark, HorusGlyph } from "@/components/brand";
import { LoginHero } from "@/components/showcase/login-hero";
import { assets as assetsTable } from "@/db/schema";
import { Card, buttonStyles } from "@/components/ui";
import { LangToggle } from "@/components/shell/controls";
import { cn } from "@/lib/cn";
import { DEMO_TODAY } from "@/lib/assumptions";
import { dateFmt } from "@/lib/format";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { PublicChat } from "@/components/public-chat";
import { ScatteredArc } from "@/components/showcase/scattered-arc";
import { RecordSphere, type Capability } from "@/components/showcase/record-sphere";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await getCurrentUser()) redirect({ href: "/overview", locale });
  const t = await getTranslations("login");
  const b = await getTranslations("brand");
  const s = await getTranslations("sample");
  const r = await getTranslations("roles");
  const db = await getDb();
  const nAssets = (await db.select({ id: assetsTable.id }).from(assetsTable)).length;
  const lg = await getTranslations("login");
  const all0 = await db.select().from(users).orderBy(asc(sql`case role when 'investor' then 1 when 'manager' then 2 else 3 end`), asc(users.id));
  const all = all0.filter((u) => u.status !== "deactivated");
  const ar = locale === "ar";
  const sh = await getTranslations("show");
  // Four of each side are built in this demo; the last two are planned.
  const caps = (k: "in" | "out") => Object.entries(sh.raw(k) as Record<string, { t: string; n: string; d: string }>).map(([id, x], i): Capability => ({ id, title: x.t, note: x.n, detail: x.d, built: i < 4 }));
  const how = sh.raw("arcD") as Record<string, string>;
  const arcItems = Object.entries(sh.raw("arc") as Record<string, string>).map(([k, label]) => ({ label, how: how[k] }));
  return (
    <div data-theme="dark" className="flex min-h-dvh flex-col bg-bg text-text">
      <div role="note" className="bg-gold-fill px-4 py-1.5 text-center text-xs font-semibold text-on-gold">{s("ribbon")}</div>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 border-b border-line/60 px-4 py-4">
        <span className="flex items-center gap-4"><Wordmark /><span className="hidden text-xs text-muted sm:inline">{lg("motto")}</span></span>
        <LangToggle />
      </header>
      <main id="main" className="isolate mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-10 md:pt-16">
        <LoginHero label={b("tagline")} lineA={lg("heroA")} lineB={lg("heroB")} lead={lg("heroLead")} cta={lg("heroCta")} live={lg("heroLive")}
          chips={[{ label: lg("chip1Label"), title: lg("chip1Title"), note: lg("chip1Note", { n: nAssets }) }, { label: lg("chip2Label"), title: lg("chip2Title"), note: lg("chip2Note") }, { label: lg("chip3Label"), title: lg("chip3Title"), note: lg("chip3Note") }]} />
        <p className="mt-10 flex items-center gap-2 text-sm text-gold"><HorusGlyph size={18} />{b("triad")}. {b("aiLine")}.</p>
        <Reveal delay={0.16}>
          <h2 id="signin" className="mb-1 mt-12 scroll-mt-6 font-display text-2xl">{t("title")}</h2>
          <p className="mb-6 max-w-xl text-base text-muted">{t("sub")}</p>
        </Reveal>
        <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(["investor", "manager", "analyst", "admin"] as const).map((role) => {
            const group = all.filter((u) => u.role === role);
            return (
              <StaggerItem key={role} className="flex"><Card className="flex flex-1 flex-col">
                <h3 className="font-display text-xl text-gold">{r(role)}</h3>
                <p className="mb-4 mt-1 flex-1 text-base text-muted">{t(`${role}Desc` as "investorDesc")}</p>
                <div className="flex flex-col gap-2">
                  {group.map((u) => (
                    <form key={u.id} action={signIn.bind(null, u.id, locale)}>
                      <button type="submit" className={cn(buttonStyles({ variant: role === "manager" && u.id === "u-manager-1" ? "gold" : "outline" }), "w-full")}>
                        {t("enter", { name: ar ? u.nameAr : u.name })}{u.status === "invited" && <span className="text-xs font-normal opacity-80"> ({lg("invitedTag")})</span>}
                      </button>
                    </form>
                  ))}
                </div>
              </Card></StaggerItem>
            );
          })}
        </Stagger>
        <ScatteredArc items={arcItems} rtl={ar} copy={{ heading: sh("arcHeading"), sub: sh("arcSub"), body: sh("arcBody"), listLabel: sh("arcList"), how: sh("arcHow"), today: sh("arcToday"), tryIt: sh("arcTry"), close: sh("arcClose"), hint: sh("arcHint") }} />
        <RecordSphere inputs={caps("in")} outputs={caps("out")} copy={{ heading: sh("sphHeading"), lead: sh("sphLead"), center: sh("sphCenter"), centerSub: sh("sphCenterSub"), inputs: sh("inputs"), outputs: sh("outputs"), built: sh("built"), planned: sh("planned"), hint: sh("sphHint"), tryIt: sh("detailTry"), close: sh("arcClose") }} />
        <p className="mt-12 text-xs text-muted">{s("asOf", { date: dateFmt(DEMO_TODAY, locale) })}. {s("footer")}</p>
      </main>
      <PublicChat />
    </div>
  );
}
