"use server";
import { getCurrentUser } from "@/lib/session";
import { addWorkNote, completeWork, createWork, updateWork } from "@/lib/work";

async function who() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
export async function createWorkAction(payload: unknown) { return createWork(await who(), payload); }
export async function updateWorkAction(id: string, payload: unknown) { return updateWork(await who(), String(id), payload); }
export async function completeWorkAction(id: string, payload: unknown) { return completeWork(await who(), String(id), payload); }
export async function addWorkNoteAction(id: string, text: string) { return addWorkNote(await who(), String(id), String(text)); }
