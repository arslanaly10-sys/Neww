import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card, buttonStyles } from "@/components/ui";
import { Wordmark } from "@/components/brand";
import { BlurHeadline, HeroDots } from "@/components/brand-fx";

export default async function NotFound() {
  const t = await getTranslations("error");
  return (
    <main id="main" className="relative isolate grid min-h-dvh w-full place-items-center px-4">
      <HeroDots className="pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,var(--color-text)_15%,transparent_70%)]" />
      <Card className="w-full max-w-xl text-center">
        <Wordmark className="mb-4 block" />
        <BlurHeadline text="404" className="font-display text-3xl" />
        <p className="mt-2 text-muted">{t("notFound")}</p>
        <Link href="/overview" className={`${buttonStyles({ variant: "gold" })} mt-5`}>{t("home")}</Link>
      </Card>
    </main>
  );
}
