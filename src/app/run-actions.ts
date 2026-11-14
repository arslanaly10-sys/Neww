"use server";
import { getCurrentUser } from "@/lib/session";
import { reviewRun, startAssetRun } from "@/lib/horus-runs";

async function who() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
export async function startRunAction(assetId: string) { return startAssetRun(await who(), String(assetId)); }
export async function reviewRunAction(id: string, payload: unknown) { return reviewRun(await who(), String(id), payload); }
