"use server";
import { z } from "zod";
import { getCurrency, getCurrentUser } from "@/lib/session";
import { askHorus } from "@/lib/horus/gateway";
import { resolveCitation } from "@/lib/horus/citations";
import { saveDraftUpdate } from "@/lib/horus/drafts";
import { deleteThread, getThread, listThreads } from "@/lib/horus/history";
import { confirmHorusAction } from "@/lib/horus/actions";
import { saveHorusFile } from "@/lib/horus/files";

const loc = z.enum(["en", "ar"]);
async function who() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
export async function askHorusAction(question: string, locale: string) {
  const l = loc.parse(locale);
  return askHorus(await who(), String(question ?? ""), l, await getCurrency());
}
export async function getCitationAction(id: string, locale: string) {
  return resolveCitation(await who(), String(id), loc.parse(locale), await getCurrency());
}
export async function saveDraftAction(draft: { title: string; body: string; cites: string[] }, locale: string) {
  const d = z.object({ title: z.string().min(1).max(200), body: z.string().min(1).max(4000), cites: z.array(z.string()).max(60) }).parse(draft);
  return saveDraftUpdate(await who(), d, loc.parse(locale));
}

export async function listThreadsAction() { return listThreads(await who()); }
export async function getThreadAction(id: string) { return getThread(await who(), String(id)); }
export async function deleteThreadAction(id: string) { return deleteThread(await who(), String(id)); }
export async function confirmHorusActionAction(action: unknown) { return confirmHorusAction(await who(), action); }
export async function uploadHorusFileAction(form: FormData) {
  const f = form.get("file");
  if (!(f instanceof File)) return { ok: false as const, error: "empty" as const };
  return saveHorusFile(await who(), f);
}
