"use server";
import { getCurrentUser } from "@/lib/session";
import { addReading, assignContractor, createContractor, decideCapex, proposeCapex, rateWork, recordInspection, scheduleInspection, updateCapex } from "@/lib/ops";

async function who() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}
export async function createContractorAction(p: unknown) { return createContractor(await who(), p); }
export async function assignContractorAction(workId: string, contractorId: string | null) { return assignContractor(await who(), String(workId), contractorId ? String(contractorId) : null); }
export async function rateWorkAction(workId: string, rating: number) { return rateWork(await who(), String(workId), Number(rating)); }
export async function scheduleInspectionAction(p: unknown) { return scheduleInspection(await who(), p); }
export async function recordInspectionAction(id: string, p: unknown) { return recordInspection(await who(), String(id), p); }
export async function addReadingAction(p: unknown) { return addReading(await who(), p); }
export async function proposeCapexAction(p: unknown) { return proposeCapex(await who(), p); }
export async function decideCapexAction(id: string, d: "approve" | "reject", note: string) { return decideCapex(await who(), String(id), d, String(note ?? "")); }
export async function updateCapexAction(id: string, p: unknown) { return updateCapex(await who(), String(id), p); }
