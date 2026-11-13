"use server";
import { getCurrentUser } from "@/lib/session";
import { createEvent, deleteEvent, updateEvent } from "@/lib/calendar";

async function who() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
export async function createEventAction(payload: unknown) { return createEvent(await who(), payload); }
export async function updateEventAction(id: string, payload: unknown) { return updateEvent(await who(), String(id), payload); }
export async function deleteEventAction(id: string) { return deleteEvent(await who(), String(id)); }
