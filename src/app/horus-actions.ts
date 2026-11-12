"use server";
import { z } from "zod";
import { getCurrency, getCurrentUser } from "@/lib/session";
import { askHorus } from "@/lib/horus/gateway";
import { resolveCitation } from "@/lib/horus/citations";
import { saveDraftUpdate } from "@/lib/horus/drafts";

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
