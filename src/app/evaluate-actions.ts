"use server";
import { headers } from "next/headers";
import { saveIntakeContact, submitIntake } from "@/lib/horus-runs";

const ipOf = async () => ((await headers()).get("x-forwarded-for") ?? "local").split(",")[0].trim();
const lang = (l: string) => (l === "ar" ? "ar" : "en");

/** Public: run the HORUS questionnaire. No sign-in. */
export async function submitIntakeAction(payload: unknown, locale: string) { return submitIntake(payload, lang(locale), await ipOf()); }
/** Public: leave contact details to keep the result in a portfolio workspace. */
export async function saveContactAction(id: string, payload: unknown, locale: string) { return saveIntakeContact(String(id), payload, lang(locale), await ipOf()); }
