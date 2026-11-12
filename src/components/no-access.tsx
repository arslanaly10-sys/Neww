import { getTranslations } from "next-intl/server";
import { Card } from "./ui";
import { Lock } from "lucide-react";
import type { Role } from "@/lib/permissions";

export async function NoAccess({ role }: { role: Role }) {
  const t = await getTranslations("noAccess");
  const r = await getTranslations("roles");
  return (
    <Card className="mx-auto mt-10 max-w-lg text-center">
      <Lock aria-hidden="true" className="mx-auto mb-3 text-gold" />
      <h1 className="font-display text-2xl">{t("title")}</h1>
      <p className="mt-2 text-muted">{t("body", { role: r(role) })}</p>
    </Card>
  );
}
