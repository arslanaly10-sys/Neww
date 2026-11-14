"use server";
import { getCurrentUser } from "@/lib/session";
import { importFile, importNow } from "@/lib/market-data/importers";

async function who() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
export async function importNowAction(sourceId: string) { return importNow(await who(), String(sourceId)); }
export async function importFileAction(payload: unknown) { return importFile(await who(), payload); }
