import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Wordmark } from "../brand";
import { LangToggle } from "../shell/controls";

/** The public pages' frame, in the brand's dark look: ribbon, wordmark, language, and a way back to sign-in. */
export async function PublicShell({ children }: { children: React.ReactNode }) {
  const s = await getTranslations("sample");
  const t = await getTranslations("hv");
  return (
    <div data-theme="dark" className="flex min-h-dvh flex-col bg-bg text-text">
      <div role="note" className="bg-gold-fill px-4 py-1.5 text-center text-xs font-semibold text-on-gold">{s("ribbon")}</div>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 border-b border-line/60 px-4 py-4">
        <Link href="/" aria-label={t("home")}><Wordmark /></Link>
        <span className="flex items-center gap-3"><Link href="/#signin" className="hidden text-sm text-muted underline-offset-4 hover:underline sm:inline">{t("signInLink")}</Link><LangToggle /></span>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-10">{children}</main>
    </div>
  );
}
