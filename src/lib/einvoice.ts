import "server-only";
import { desc, eq } from "drizzle-orm";
import { withSession } from "@/db/client";
import { assets, districts, leases, rentInvoices, tenants } from "@/db/schema";
import { can } from "./permissions";
import { DEMO_TODAY, SAMPLE_FX_EGP_PER_USD } from "./assumptions";
import type { CurrentUser } from "./session";

/**
 * E-invoice drafts in the shape of the Egyptian Tax Authority's invoice document (version 1.0), built from a rent
 * invoice, with local checks. They are UNSIGNED DRAFTS for review: submitting needs the taxpayer's registration,
 * an ERP registered with the ETA, a signing certificate (token or HSM) and API credentials, none of which a demo has.
 * VAT treatment here is a sample assumption (residential rent exempt, other rent at 14%); confirm with a tax adviser.
 */
export const ISSUER = { name: "Sample Family Office (fictional)", taxId: "000000000", activityCode: "6810", governate: "Cairo", regionCity: "New Cairo", street: "Sample Street", buildingNumber: "1" } as const;
const RESIDENTIAL = ["apartment", "villa"];
const r5 = (x: number) => Math.round(x * 100000) / 100000;

export interface Check { id: string; ok: boolean; level: "error" | "warning"; params?: Record<string, string | number> }

export async function listInvoicesForEInvoice(user: CurrentUser) {
  if (!can(user.role, "rent.manage")) return null;
  return withSession({ userId: user.id, role: user.role }, (tx) => tx.select({ i: rentInvoices, tenant: tenants.name, tenantAr: tenants.nameAr, asset: assets.name, assetAr: assets.nameAr, type: assets.type }).from(rentInvoices).innerJoin(tenants, eq(tenants.id, rentInvoices.tenantId)).innerJoin(assets, eq(assets.id, rentInvoices.assetId)).orderBy(desc(rentInvoices.period)).limit(40));
}

export async function buildEInvoice(user: CurrentUser, invoiceId: string) {
  if (!can(user.role, "rent.manage")) return null;
  const d = await withSession({ userId: user.id, role: user.role }, async (tx) => {
    const [i] = await tx.select().from(rentInvoices).where(eq(rentInvoices.id, String(invoiceId)));
    if (!i) return null;
    const [l] = await tx.select().from(leases).where(eq(leases.id, i.leaseId));
    const [t] = await tx.select().from(tenants).where(eq(tenants.id, i.tenantId));
    const [a] = await tx.select().from(assets).where(eq(assets.id, i.assetId));
    const [dist] = await tx.select().from(districts).where(eq(districts.id, a.districtId));
    return { i, l, t, a, dist };
  });
  if (!d) return null;
  const { i, l, t, a, dist } = d;
  const residential = RESIDENTIAL.includes(a.type);
  const rate = residential ? 0 : 14;
  const net = r5(i.amountEgp);
  const tax = r5((net * rate) / 100);
  const doc = {
    issuer: { address: { branchID: "0", country: "EG", governate: ISSUER.governate, regionCity: ISSUER.regionCity, street: ISSUER.street, buildingNumber: ISSUER.buildingNumber }, type: "B", id: ISSUER.taxId, name: ISSUER.name },
    receiver: { address: { country: "EG", governate: "Cairo", regionCity: dist?.name ?? a.districtId, street: a.compound, buildingNumber: "1" }, type: "B", id: "", name: t.name },
    documentType: "I", documentTypeVersion: "1.0", dateTimeIssued: `${i.period}T09:00:00Z`, taxpayerActivityCode: ISSUER.activityCode, internalID: i.id,
    invoiceLines: [{
      description: `Rent for ${i.period.slice(0, 7)}, lease ${l.id}, ${a.name}`, itemType: "EGS", itemCode: `EG-${ISSUER.taxId}-RENT`, unitType: "EA", quantity: 1, internalCode: l.id,
      salesTotal: net, total: r5(net + tax), valueDifference: 0, totalTaxableFees: 0, netTotal: net, itemsDiscount: 0,
      unitValue: i.currency === "USD" ? { currencySold: "USD", amountSold: r5(i.amount), currencyExchangeRate: SAMPLE_FX_EGP_PER_USD, amountEGP: net } : { currencySold: "EGP", amountEGP: net },
      discount: { rate: 0, amount: 0 }, taxableItems: [{ taxType: "T1", amount: tax, subType: residential ? "V003" : "V009", rate }],
    }],
    totalDiscountAmount: 0, totalSalesAmount: net, netAmount: net, taxTotals: [{ taxType: "T1", amount: tax }], totalAmount: r5(net + tax), extraDiscountAmount: 0, totalItemsDiscountAmount: 0,
  };
  const line = doc.invoiceLines[0];
  const checks: Check[] = [
    { id: "required", ok: !!(doc.documentType && doc.dateTimeIssued && doc.internalID && doc.invoiceLines.length && doc.taxpayerActivityCode), level: "error" },
    { id: "lineTotals", ok: Math.abs(line.total - (line.netTotal + line.taxableItems.reduce((s, x) => s + x.amount, 0))) < 0.00001, level: "error" },
    { id: "docTotals", ok: Math.abs(doc.totalAmount - doc.invoiceLines.reduce((s, x) => s + x.total, 0)) < 0.00001 && Math.abs(doc.taxTotals[0].amount - tax) < 0.00001, level: "error" },
    { id: "taxRate", ok: Math.abs(tax - (net * rate) / 100) < 0.00001, level: "error", params: { rate } },
    { id: "currency", ok: i.currency === "EGP" || (line.unitValue.currencyExchangeRate ?? 0) > 0, level: "error" },
    { id: "notFuture", ok: doc.dateTimeIssued.slice(0, 10) <= DEMO_TODAY, level: "error" },
    { id: "issuerId", ok: /^\d{9}$/.test(ISSUER.taxId) && ISSUER.taxId !== "000000000", level: "warning" },
    { id: "receiverId", ok: doc.receiver.id !== "", level: "warning" },
    { id: "itemCode", ok: false, level: "warning" },
    { id: "signature", ok: false, level: "warning" },
  ];
  return { doc, checks, invoice: i, tenant: t, asset: a, lease: l, residential, rate, ready: checks.every((c) => c.ok) };
}
