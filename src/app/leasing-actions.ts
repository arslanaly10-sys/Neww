"use server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { recordPayment, sendRentReminder, updateRenewal } from "@/lib/leasing";

async function who() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
export async function recordPaymentAction(payload: unknown) { return recordPayment(await who(), payload); }
export async function sendReminderAction(invoiceId: string, locale: string) { return sendRentReminder(await who(), String(invoiceId), z.enum(["en", "ar"]).parse(locale)); }
export async function updateRenewalAction(payload: unknown) { return updateRenewal(await who(), payload); }
