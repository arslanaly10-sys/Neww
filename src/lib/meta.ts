import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

/** A page's browser title from its heading text, so each tab reads "Valuation · ZMNHOOF OS" (the root layout adds the suffix). */
export const titleFrom = (namespace: string, key = "title") =>
  async ({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> => {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace });
    return { title: t(key as never) };
  };
