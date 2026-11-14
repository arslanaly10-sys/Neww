"use server";
import { getCurrentUser } from "@/lib/session";
import { payInstallment, reviewFact, updateAssetDetails } from "@/lib/asset-record";

async function who() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
export async function updateAssetAction(id: string, payload: unknown) { return updateAssetDetails(await who(), String(id), payload); }
export async function reviewFactAction(id: string, payload: unknown) { return reviewFact(await who(), String(id), payload); }
export async function payInstallmentAction(id: string) { return payInstallment(await who(), String(id)); }
