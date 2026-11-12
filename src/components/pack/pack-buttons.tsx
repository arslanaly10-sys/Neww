"use client";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { buttonStyles } from "../ui";
import { cn } from "@/lib/cn";

/** Plain links: the route generates the PDF on demand and the browser downloads it. */
export function PackButtons({ className }: { className?: string }) {
  const t = useTranslations("packui");
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <a href="/api/pack?lang=en" download className={buttonStyles({ variant: "gold", size: "sm" })}><Download aria-hidden="true" size={14} />{t("en")}</a>
      <a href="/api/pack?lang=ar" download className={buttonStyles({ variant: "outline", size: "sm" })}><Download aria-hidden="true" size={14} />{t("ar")}</a>
    </div>
  );
}
