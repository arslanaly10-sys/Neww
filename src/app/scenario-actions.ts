"use server";
import { getCurrentUser } from "@/lib/session";
import { publishScenarioSet, reproduceScenario, runScenarioForUser, saveScenario } from "@/lib/scenario-service";

async function who() { const u = await getCurrentUser(); if (!u) throw new Error("Not signed in"); return u; }
export async function runScenarioAction(inputs: unknown, setId: string | null) { return runScenarioForUser(await who(), inputs, setId); }
export async function saveScenarioAction(p: { name: string; notes?: string; inputs: unknown; setId: string }) { return saveScenario(await who(), p); }
export async function reproduceScenarioAction(id: string) { return reproduceScenario(await who(), String(id)); }
export async function publishScenarioSetAction(p: unknown) { return publishScenarioSet(await who(), p); }
