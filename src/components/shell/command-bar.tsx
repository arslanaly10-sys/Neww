"use client";
import { useCallback, useEffect, useState } from "react";
import { Command } from "cmdk";
import { useLocale, useTranslations } from "next-intl";
import { Building2, Calculator, Download, FileText, Globe, MapPin, Search, SlidersHorizontal, Coins } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { setCurrency } from "@/app/actions";
import { cn } from "@/lib/cn";
import type { Area } from "@/lib/permissions";
import { AREA_ICON } from "./nav";
import { useHorus } from "../horus/provider";
import { HorusGlyph } from "../brand";

export interface CmdIndex {
  areas: Area[];
  assets: { id: string; name: string; nameAr: string; district: string; districtAr: string }[];
  districts: { id: string; name: string; nameAr: string }[];
  docs: { id: string; title: string; kind: string; assetId: string; assetName: string; assetNameAr: string }[];
  currency: "EGP" | "USD";
  canAsk: boolean;
  canValue: boolean;
  canPack: boolean;
}

export function CommandBar({ index, className }: { index: CmdIndex; className?: string }) {
  const t = useTranslations("cmd");
  const nav = useTranslations("nav");
  const dk = useTranslations("docKind");
  const shell = useTranslations("shell");
  const locale = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const horus = useHorus();
  const c2 = useTranslations("cmd2");
  const pk = useTranslations("packui");
  const dc = useTranslations("docs");
  const sc = useTranslations("scn");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = useCallback((href: string) => { setOpen(false); router.push(href); }, [router]);
  const askHorus = (q: string) => { setOpen(false); setQuery(""); horus.ask(q); };
  const item = "flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-sm text-text data-[selected=true]:bg-surface-2 data-[selected=true]:text-gold";
  const group = "px-1 pb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted";
  const nextCur = index.currency === "EGP" ? "USD" : "EGP";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("open")} aria-keyshortcuts="Control+K Meta+K"
        className={cn("flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm text-muted hover:text-text", className)}>
        <Search aria-hidden="true" size={16} />
        <span className="flex-1 truncate text-start">{shell("search")}</span>
        <kbd dir="ltr" className="hidden rounded border border-line px-1.5 text-[11px] sm:inline">Ctrl K</kbd>
      </button>
      <Command.Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }} label={t("placeholder")}
        overlayClassName="fixed inset-0 z-40 bg-black/60"
        contentClassName="fixed start-1/2 top-[10vh] z-50 w-[min(36rem,calc(100vw-1.5rem))] -translate-x-1/2 rtl:translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search aria-hidden="true" size={16} className="text-muted" />
          <Command.Input value={query} onValueChange={setQuery} placeholder={t("placeholder")} className="min-h-12 w-full bg-transparent text-sm text-text outline-none placeholder:text-muted" />
        </div>
        <Command.List className="max-h-[60vh] overflow-y-auto p-1.5">
          {index.canAsk && query.trim().length >= 3 && (
            <Command.Group forceMount heading="Horus" className={group}>
              <Command.Item forceMount value={`ask horus ${query}`} onSelect={() => askHorus(query.trim())} className={item}>
                <HorusGlyph size={16} /><span className="flex-1 truncate">{c2("ask", { q: query.trim() })}</span>
              </Command.Item>
            </Command.Group>
          )}
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted">{t("empty")}</Command.Empty>
          <Command.Group heading={t("go")} className={group}>
            {index.areas.map((a) => {
              const Icon = AREA_ICON[a];
              return (
                <Command.Item key={a} value={`${nav(a)} ${a}`} onSelect={() => go(`/${a}`)} className={item}>
                  <Icon aria-hidden="true" size={16} />{nav(a)}
                </Command.Item>
              );
            })}
          </Command.Group>
          {index.assets.length > 0 && (
            <Command.Group heading={t("assets")} className={group}>
              {index.assets.map((a) => (
                <Command.Item key={a.id} value={`${a.id} ${a.name} ${a.nameAr} ${a.district} ${a.districtAr}`} onSelect={() => go(`/asset/${a.id}`)} className={item}>
                  <Building2 aria-hidden="true" size={16} />
                  <span className="flex-1 truncate">{ar ? a.nameAr : a.name}</span>
                  <span className="truncate text-xs text-muted">{ar ? a.districtAr : a.district}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          <Command.Group heading={t("districts")} className={group}>
            {index.districts.map((d) => (
              <Command.Item key={d.id} value={`district ${d.name} ${d.nameAr}`} onSelect={() => go(`/market#${d.id}`)} className={item}>
                <MapPin aria-hidden="true" size={16} />{ar ? d.nameAr : d.name}
              </Command.Item>
            ))}
          </Command.Group>
          {index.docs.length > 0 && (
            <Command.Group heading={t("documents")} className={group}>
              {index.docs.map((d) => (
                <Command.Item key={d.id} value={`${d.id} ${d.title} ${dk(d.kind as "lease")} ${d.assetName} ${d.assetNameAr}`} onSelect={() => go(`/asset/${d.assetId}`)} className={item}>
                  <FileText aria-hidden="true" size={16} />
                  <span className="flex-1 truncate">{d.title}</span>
                  <span className="truncate text-xs text-muted">{ar ? d.assetNameAr : d.assetName}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          <Command.Group heading={t("actions")} className={group}>
            {index.canValue && (
              <Command.Item value="run a valuation value property estimate تقييم" onSelect={() => go("/valuation")} className={item}>
                <Calculator aria-hidden="true" size={16} />{c2("run")}
              </Command.Item>
            )}
            {index.canValue && (
              <Command.Item value="scenarios scenario sliders stress السيناريوهات" onSelect={() => go("/portfolio/scenarios")} className={item}>
                <SlidersHorizontal aria-hidden="true" size={16} />{sc("title")}
              </Command.Item>
            )}
            {index.canValue && (
              <Command.Item value="documents flags missing expiring read document المستندات" onSelect={() => go("/asset/documents")} className={item}>
                <FileText aria-hidden="true" size={16} />{dc("title")}
              </Command.Item>
            )}
            {index.canPack && (["en", "ar"] as const).map((l) => (
              <Command.Item key={l} value={`generate investor pack pdf ${l} ملف المستثمر`} onSelect={() => { setOpen(false); window.location.assign(`/api/pack?lang=${l}`); }} className={item}>
                <Download aria-hidden="true" size={16} />{pk("cmd", { lang: l === "en" ? pk("langEn") : pk("langAr") })}
              </Command.Item>
            ))}
            {index.canAsk && (
              <Command.Item value="open horus ask analyst اسأل حورس" onSelect={() => { setOpen(false); horus.setOpen(true); }} className={item}>
                <HorusGlyph size={16} />{c2("openHorus")}
              </Command.Item>
            )}
            <Command.Item value="switch language arabic english العربية" onSelect={() => { setOpen(false); router.replace(path, { locale: ar ? "en" : "ar" }); }} className={item}>
              <Globe aria-hidden="true" size={16} />{t("switchLang")}
            </Command.Item>
            <Command.Item value={`currency ${nextCur} egp usd`} onSelect={async () => { setOpen(false); await setCurrency(nextCur); router.refresh(); }} className={item}>
              <Coins aria-hidden="true" size={16} />{t("switchCur", { cur: nextCur })}
            </Command.Item>
          </Command.Group>
        </Command.List>
        {index.canAsk && <p className="border-t border-line px-3 py-2 text-xs text-muted">{c2("actionsHint")}</p>}
      </Command.Dialog>
    </>
  );
}
