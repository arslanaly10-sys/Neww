import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card, buttonStyles } from "@/components/ui";
import { Wordmark } from "@/components/brand";

export default async function NotFound() {
  const t = await getTranslations("error");
  return (
    <main id="main" className="mx-auto grid min-h-dvh w-full max-w-xl place-items-center px-4">
      <Card className="w-full text-center">
        <Wordmark className="mb-4 block" />
        <h1 className="font-display text-3xl">404</h1>
        <p className="mt-2 text-muted">{t("notFound")}</p>
        <Link href="/overview" className={`${buttonStyles({ variant: "gold" })} mt-5`}>{t("home")}</Link>
      </Card>
    </main>
  );
}
