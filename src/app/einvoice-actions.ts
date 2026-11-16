"use server";
import { getCurrentUser } from "@/lib/session";
import { approveEInvoice, signEInvoice, verifyEInvoice, voidEInvoice } from "@/lib/einvoice-sign";

async function who() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
export async function approveEInvoiceAction(invoiceId: string) { return approveEInvoice(await who(), String(invoiceId)); }
export async function signEInvoiceAction(id: string) { return signEInvoice(await who(), String(id)); }
export async function verifyEInvoiceAction(id: string) { return verifyEInvoice(await who(), String(id)); }
export async function voidEInvoiceAction(id: string, reason: string) { return voidEInvoice(await who(), String(id), { reason }); }
