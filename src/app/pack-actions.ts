"use server";
import { getCurrentUser } from "@/lib/session";
import { verifyPack } from "@/lib/pack/service";

export async function verifyPackAction(hash: string) {
  if (!(await getCurrentUser())) throw new Error("Not signed in");
  return verifyPack(String(hash));
}
