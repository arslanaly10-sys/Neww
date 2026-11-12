import "server-only";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { getCurrency, getCurrentUser } from "./session";
import { AREA_ACCESS, type Area } from "./permissions";

/** Resolve the signed-in user for a page. Redirects to sign-in if there is none; flags roles that may not open the area. */
export async function pageContext(area: Area) {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/", locale });
  const currency = await getCurrency();
  return { user, currency, locale, denied: !AREA_ACCESS[area].includes(user.role) };
}
