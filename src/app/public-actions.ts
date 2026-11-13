"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { askPublic } from "@/lib/horus/gateway";
import { submitLead } from "@/lib/leads";

/** The public chatbot on the sign-in page. No session: only public help articles and demo requests. */
const loc = z.enum(["en", "ar"]);
const ipOf = async () => ((await headers()).get("x-forwarded-for") ?? "local").split(",")[0].trim();

export async function askPublicAction(question: string, locale: string) {
  return askPublic(String(question ?? "").slice(0, 400), loc.parse(locale), { ip: await ipOf() });
}
export async function submitLeadAction(form: unknown, locale: string) {
  return submitLead(form, loc.parse(locale), await ipOf());
}
