import "server-only";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { withSession } from "@/db/client";
import { assets, comparableSales, districts, documents, investorUpdates, leases, marketSeries, marketSources, tenants, valuations, users } from "@/db/schema";
import { can } from "../permissions";
import { dateFmt, money, pct } from "../format";
import { SAMPLE_FX_EGP_PER_USD } from "../assumptions";
import { momentum3m, sentiment } from "../metrics";
import { CITE_RE } from "./types";
import { runTool } from "./tools";
import type { CurrentUser } from "../session";

export interface CiteRow { label: string; value: string }
export interface CiteDetail { id: string; kind: string; title: string; rows: CiteRow[]; href: string | null; sample: boolean }

/** Resolve a citation chip to the exact row it points to, under the viewer's own row-level security. */
export async function resolveCitation(user: CurrentUser, id: string, locale: string, currency: "EGP" | "USD"): Promise<CiteDetail | null> {
  if (!CITE_RE.test(id)) return null;
  const [kind, key] = id.split(":") as [string, string];
  const t = await getTranslations({ locale, namespace: "cite" });
  const ty = await getTranslations({ locale, namespace: "types" });
  const st = await getTranslations({ locale, namespace: "status" });
  const dk = await getTranslations({ locale, namespace: "docKind" });
  const ds = await getTranslations({ locale, namespace: "docStatus" });
  const fi = await getTranslations({ locale, namespace: "finish" });
  const ar = locale === "ar";
  const sess = { userId: user.id, role: user.role };
  const M = (n: number) => money(n, currency, locale, { fx: SAMPLE_FX_EGP_PER_USD });
  const D = (d: string | null) => (d ? dateFmt(d, locale) : "–");
  const row = (label: string, value: string | number | null | undefined): CiteRow => ({ label, value: value === null || value === undefined || value === "" ? "–" : String(value) });

  // Calculations run their own session transactions, so they must not be nested inside another one.
  if (kind === "calc") {
    const ctx = { user: { id: user.id, name: user.name, role: user.role }, locale, currency, fx: SAMPLE_FX_EGP_PER_USD };
    const fnName = key.startsWith("risk_") ? "asset_detail" : key;
    const args = key.startsWith("risk_") ? { assetId: key.slice(5) } : {};
    if (!can(user.role, "horus.use")) return null;
    const out = await runTool(fnName, args, ctx);
    if ((out.data as { error?: string })?.error) return null;
    const flat: CiteRow[] = [];
    const walk = (o: unknown, prefix: string) => {
      if (flat.length > 24) return;
      if (o && typeof o === "object") {
        if ("display" in (o as object) && "full" in (o as object)) { flat.push(row(prefix, (o as { full: string }).full)); return; }
        for (const [k, v] of Object.entries(o as Record<string, unknown>)) walk(v, prefix ? `${prefix} · ${k}` : k);
      } else if (o !== undefined && o !== null) flat.push(row(prefix, String(o)));
    };
    walk(out.data, "");
    return { id, kind, href: null, sample: true, title: t("calcTitle", { name: key }), rows: [row(t("function"), fnName), row(t("assumptionSet"), key.startsWith("risk_") ? "AS-RISK-1.1.0" : "AS-MAC-1.0.0"), ...flat] };
  }

  return withSession(sess, async (tx): Promise<CiteDetail | null> => {
    switch (kind) {
      case "asset": {
        const [r] = await tx.select({ a: assets, d: districts }).from(assets).innerJoin(districts, eq(assets.districtId, districts.id)).where(eq(assets.id, key));
        if (!r) return null;
        const a = r.a;
        return { id, kind, href: `/asset/${a.id}`, sample: true, title: `${a.id} · ${ar ? a.nameAr : a.name}`, rows: [
          row(t("district"), ar ? r.d.nameAr : r.d.name), row(t("type"), ty(a.type as "villa")), row(t("area"), a.areaSqm), row(t("finish"), fi(a.finish as "luxury")),
          row(t("value"), M(a.valueEgp)), row(t("cost"), M(a.costEgp)), row(t("valueSource"), a.valueSource === "seed" ? t("seedRecord") : a.valueSource), row(t("valueSetOn"), D(a.valueSetOn)), row(t("occupancy"), st(a.occupancy as "let")),
        ] };
      }
      case "lease": {
        const [r] = await tx.select({ l: leases, t: tenants }).from(leases).innerJoin(tenants, eq(leases.tenantId, tenants.id)).where(eq(leases.id, key));
        if (!r) return null;
        const showRent = can(user.role, "asset.income_costs.view");
        return { id, kind, href: `/asset/${r.l.assetId}`, sample: true, title: `${r.l.id} · ${ar ? r.t.nameAr : r.t.name}`, rows: [
          row(t("asset"), r.l.assetId), row(t("term"), `${D(r.l.startDate)} – ${D(r.l.endDate)}`),
          row(t("rent"), showRent ? (r.l.currency === "USD" ? M(r.l.monthlyRent * SAMPLE_FX_EGP_PER_USD) : M(r.l.monthlyRent)) : t("hidden")),
          row(t("indexation"), `${r.l.annualIndexationPct}%`), row(t("deposit"), t("months", { n: r.l.depositMonths })),
        ] };
      }
      case "valuation": {
        const [v] = await tx.select().from(valuations).where(eq(valuations.id, key));
        if (!v) return null;
        const [p] = await tx.select().from(users).where(eq(users.id, v.proposedBy));
        return { id, kind, href: v.assetId ? `/asset/${v.assetId}` : "/valuation", sample: true, title: `${v.id} · ${v.assetId ?? t("adHoc")}`, rows: [
          row(t("status"), v.status), row(t("modelEstimate"), M(v.modelEstimateEgp)), row(t("finalValue"), v.finalValueEgp ? M(v.finalValueEgp) : null),
          row(t("adjustment"), v.finalValueEgp ? pct(v.finalValueEgp / v.modelEstimateEgp - 1, locale) : null), row(t("reason"), v.adjustmentReason), row(t("proposedBy"), ar ? p?.nameAr : p?.name), row(t("assumptionSet"), v.assumptionSetId),
        ] };
      }
      case "sale": {
        const [s] = await tx.select().from(comparableSales).where(eq(comparableSales.id, key));
        if (!s) return null;
        return { id, kind, href: "/valuation", sample: true, title: `${s.id}`, rows: [
          row(t("district"), s.districtId), row(t("type"), ty(s.type as "villa")), row(t("area"), s.areaSqm), row(t("finish"), fi(s.finish as "luxury")), row(t("soldOn"), D(s.soldOn)), row(t("price"), M(s.priceEgp)),
        ] };
      }
      case "doc": {
        const [d] = await tx.select().from(documents).where(eq(documents.id, key));
        if (!d) return null;
        return { id, kind, href: `/asset/${d.assetId}`, sample: true, title: `${d.id} · ${dk(d.kind as "lease")}`, rows: [row(t("asset"), d.assetId), row(t("status"), ds(d.status as "verified")), row(t("issued"), D(d.issuedOn)), row(t("expires"), D(d.expiresOn))] };
      }
      case "update": {
        const [u] = await tx.select().from(investorUpdates).where(eq(investorUpdates.id, key));
        if (!u) return null;
        return { id, kind, href: "/portfolio", sample: true, title: `${u.id} · ${ar ? u.titleAr : u.title}`, rows: [row(t("date"), D(u.postedOn)), row(t("text"), ar ? u.bodyAr : u.body)] };
      }
      case "market": {
        const [d] = await tx.select().from(districts).where(eq(districts.id, key));
        if (!d) return null;
        const s = (await tx.select().from(marketSeries).where(eq(marketSeries.districtId, key)).orderBy(marketSeries.month)).map((x) => Number(x.priceIndex));
        const [src] = await tx.select().from(marketSources).where(eq(marketSources.id, "ms-price-index"));
        const m = momentum3m(s);
        return { id, kind, href: `/market#${key}`, sample: true, title: `${ar ? d.nameAr : d.name}`, rows: [
          row(t("latestIndex"), s[s.length - 1].toFixed(1)), row(t("momentum"), pct(m, locale)), row(t("sentiment"), sentiment(m)),
          row(t("source"), t("syntheticSource")), row(t("published"), D(src?.publishedOn ?? null)), row(t("productionSource"), ar ? src?.productionSourceAr : src?.productionSource),
        ] };
      }
    }
    return null;
  });
}
