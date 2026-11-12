"use server";
import { getCurrentUser } from "@/lib/session";
import { computeValuation, decideValuation, submitValuation } from "@/lib/valuation-service";

async function who() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
export async function runValuationAction(input: unknown) { return computeValuation(await who(), input); }
export async function submitValuationAction(payload: unknown) { return submitValuation(await who(), payload); }
export async function decideValuationAction(id: string, decision: "approve" | "reject") {
  if (decision !== "approve" && decision !== "reject") throw new Error("Bad decision");
  return decideValuation(await who(), id, decision);
}
