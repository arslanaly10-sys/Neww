"use client";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, Card } from "@/components/ui";

/** A plain-language error with a retry. Never shows a stack trace or technical detail. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("error");
  useEffect(() => { console.error("[page error]", error.digest ?? error.message); }, [error]);
  return (
    <main id="main" className="mx-auto grid min-h-dvh w-full max-w-xl place-items-center px-4">
      <Card className="w-full text-center">
        <h1 className="font-display text-3xl">{t("title")}</h1>
        <p className="mt-2 text-muted">{t("body")}</p>
        <Button variant="gold" className="mt-5" onClick={reset}>{t("retry")}</Button>
      </Card>
    </main>
  );
}
