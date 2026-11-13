"use server";
import { getCurrentUser } from "@/lib/session";
import { addDealNote, createDeal, moveDeal, updateDeal } from "@/lib/deals";

async function who() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
export async function createDealAction(payload: unknown) { return createDeal(await who(), payload); }
export async function updateDealAction(id: string, payload: unknown) { return updateDeal(await who(), String(id), payload); }
export async function moveDealAction(id: string, payload: unknown) { return moveDeal(await who(), String(id), payload); }
export async function addDealNoteAction(id: string, text: string) { return addDealNote(await who(), String(id), String(text)); }
