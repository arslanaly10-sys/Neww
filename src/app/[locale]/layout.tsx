import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, isRtl } from "@/i18n/routing";
import "@fontsource/dm-serif-display/400.css";
import "@fontsource/dm-serif-display/400-italic.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/noto-kufi-arabic/400.css";
import "@fontsource/noto-kufi-arabic/500.css";
import "@fontsource/noto-kufi-arabic/600.css";
import "@fontsource/noto-kufi-arabic/700.css";
import "../globals.css";
import { MotionProvider } from "@/components/motion";
import { InlineScript } from "@/components/inline-script";

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#090a0c" }, { media: "(prefers-color-scheme: light)", color: "#f6f2e9" }] };
export const metadata: Metadata = {
  title: { default: "ZMNHOOF OS", template: "%s · ZMNHOOF OS" }, description: "Real estate intelligence, human conviction. A concept demo with sample data.",
  robots: { index: false, follow: false },
  openGraph: { title: "ZMNHOOF OS", description: "Real estate intelligence, human conviction. Concept demo, sample data.", images: [{ url: "/og.png", width: 1200, height: 630, alt: "ZMNHOOF OS" }] },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

/**
 * Entrance animations render their hidden starting state into the HTML. This flag (data-js on <html>) is what lets
 * that state apply: without JavaScript there is no flag and globals.css shows everything at rest. If the app has not
 * started within 4 s (a slow or failed bundle), the flag is dropped again so the page never stays blank. It also applies
 * a saved light or dark choice (the zos_theme cookie) before the first paint.
 */
const JS_FLAG = `(function(){var d=document.documentElement;d.setAttribute("data-js","");var m=document.cookie.match(/(?:^|; )zos_theme=(dark|light)/);if(m)d.setAttribute("data-theme",m[1]);setTimeout(function(){if(!window.__zosReady)d.removeAttribute("data-js")},4000)})()`;

export function generateStaticParams() { return routing.locales.map((locale) => ({ locale })); }

export default async function RootLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "nav" });
  return (
    <html lang={locale} dir={isRtl(locale) ? "rtl" : "ltr"} suppressHydrationWarning>
      <head>
        <InlineScript html={JS_FLAG} />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-gold-fill focus:px-3 focus:py-2 focus:text-on-gold">{t("skip")}</a>
        <NextIntlClientProvider><MotionProvider>{children}</MotionProvider></NextIntlClientProvider>
      </body>
    </html>
  );
}
