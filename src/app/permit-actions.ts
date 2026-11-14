"use server";
import { getCurrentUser } from "@/lib/session";
import { recordPermit, reviewPermit } from "@/lib/permits";

async function who() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
export async function recordPermitAction(p: unknown) { return recordPermit(await who(), p); }
export async function reviewPermitAction(id: string, p: unknown) { return reviewPermit(await who(), String(id), p); }
