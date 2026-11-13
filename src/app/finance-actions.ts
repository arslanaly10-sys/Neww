"use server";
import { getCurrentUser } from "@/lib/session";
import { addLedgerEntry, markDistributionPaid, proposeDistribution } from "@/lib/finance";

async function who() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
export async function addLedgerEntryAction(payload: unknown) { return addLedgerEntry(await who(), payload); }
export async function proposeDistributionAction(payload: unknown) { return proposeDistribution(await who(), payload); }
export async function markDistributionPaidAction(id: string) { return markDistributionPaid(await who(), String(id)); }
