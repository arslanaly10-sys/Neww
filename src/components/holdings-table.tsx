"use client";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { money, pct, int, type Currency, listSep } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, Card } from "./ui";

export interface HoldingRow {
  id: string; name: string; nameAr: string; district: string; districtAr: string; type: string; areaSqm: number;
  value: number; cost: number; occupancy: string; netYield: number | null;
}
type Key = "name" | "district" | "type" | "areaSqm" | "value" | "gain" | "netYield" | "occupancy";

export function HoldingsTable({ rows, currency, fx, showYield }: { rows: HoldingRow[]; currency: Currency; fx: number; showYield: boolean }) {
  const t = useTranslations("pf");
  const ty = useTranslations("types");
  const st = useTranslations("status");
  const u = useTranslations("units");
  const locale = useLocale();
  const ar = locale === "ar";
  const [key, setKey] = useState<Key>("value");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const val = (r: HoldingRow): string | number => {
      switch (key) {
        case "name": return ar ? r.nameAr : r.name;
        case "district": return ar ? r.districtAr : r.district;
        case "type": return ty(r.type as "villa");
        case "areaSqm": return r.areaSqm;
        case "value": return r.value;
        case "gain": return r.value / r.cost - 1;
        case "netYield": return r.netYield ?? -1;
        case "occupancy": return st(r.occupancy as "let");
      }
    };
    const m = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), locale)) * m || a.id.localeCompare(b.id);
    });
  }, [rows, key, dir, ar, locale, ty, st]);

  const cols: { k: Key; label: string; num?: boolean }[] = [
    { k: "name", label: t("colAsset") }, { k: "district", label: t("colDistrict") }, { k: "type", label: t("colType") },
    { k: "areaSqm", label: t("colArea"), num: true }, { k: "value", label: t("colValue"), num: true }, { k: "gain", label: t("colGain"), num: true },
    ...(showYield ? [{ k: "netYield" as Key, label: t("colYield"), num: true }] : []),
    { k: "occupancy", label: t("colStatus") },
  ];
  const pick = (k: Key) => { if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc")); else { setKey(k); setDir(k === "name" || k === "district" || k === "type" || k === "occupancy" ? "asc" : "desc"); } };
  const tone = { let: "ok", vacant: "danger", owner: "teal", land: "muted" } as const;
  const gainOf = (r: HoldingRow) => pct(r.value / r.cost - 1, locale, 0);

  return (
    <div>
      {/* Phone: sort menu + cards. */}
      <div className="mb-3 flex items-center gap-2 md:hidden">
        <label htmlFor="sortkey" className="text-sm text-muted">{t("sortBy")}</label>
        <select id="sortkey" value={key} onChange={(e) => pick(e.target.value as Key)} className="min-h-10 flex-1 rounded-md border border-line bg-surface px-2 text-sm">
          {cols.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
        </select>
        <button type="button" onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))} aria-label={dir === "asc" ? t("ascending") : t("descending")} className="grid min-h-10 w-10 place-items-center rounded-md border border-line">
          {dir === "asc" ? <ArrowUp aria-hidden="true" size={16} /> : <ArrowDown aria-hidden="true" size={16} />}
        </button>
      </div>
      <ul className="space-y-3 md:hidden">
        {sorted.map((r) => (
          <li key={r.id}>
            <Card className="p-4">
              <Link href={`/asset/${r.id}`} className="block font-semibold text-gold underline-offset-4 hover:underline">{ar ? r.nameAr : r.name}</Link>
              <p className="text-xs text-muted">{ar ? r.districtAr : r.district}{listSep(locale)}{ty(r.type as "villa")}{listSep(locale)}<bdi>{int(r.areaSqm, locale)}</bdi> {u("sqm")}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <bdi className="font-display text-lg">{money(r.value, currency, locale, { fx, compact: true })}</bdi>
                <Badge tone={tone[r.occupancy as "let"]}>{st(r.occupancy as "let")}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted">{t("colGain")}: <bdi>{gainOf(r)}</bdi>{showYield && r.netYield !== null && <>{listSep(locale)}{t("colYield")}: <bdi>{pct(r.netYield, locale)}</bdi></>}</p>
            </Card>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-lg border border-line md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("holdings")}. {t("sortHelp")}</caption>
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>
              {cols.map((c) => (
                <th key={c.k} scope="col" aria-sort={key === c.k ? (dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3 py-2.5 font-semibold", c.num ? "text-end" : "text-start")}>
                  <button type="button" onClick={() => pick(c.k)} className={cn("inline-flex min-h-8 items-center gap-1   hover:text-text", key === c.k && "text-gold")}>
                    {c.label}
                    {key === c.k ? (dir === "asc" ? <ArrowUp aria-hidden="true" size={12} /> : <ArrowDown aria-hidden="true" size={12} />) : <ChevronsUpDown aria-hidden="true" size={12} />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-3 py-2.5"><Link href={`/asset/${r.id}`} className="font-semibold text-gold underline-offset-4 hover:underline">{ar ? r.nameAr : r.name}</Link><span className="num ms-2 text-xs text-muted">{r.id}</span></td>
                <td className="px-3 py-2.5">{ar ? r.districtAr : r.district}</td>
                <td className="px-3 py-2.5">{ty(r.type as "villa")}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-end"><bdi>{int(r.areaSqm, locale)}</bdi> {u("sqm")}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-end"><bdi>{money(r.value, currency, locale, { fx })}</bdi></td>
                <td className="px-3 py-2.5 text-end"><bdi>{gainOf(r)}</bdi></td>
                {showYield && <td className="px-3 py-2.5 text-end"><bdi>{r.netYield === null ? "–" : pct(r.netYield, locale)}</bdi></td>}
                <td className="px-3 py-2.5"><Badge tone={tone[r.occupancy as "let"]}>{st(r.occupancy as "let")}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
