"use server";
import { getCurrentUser } from "@/lib/session";
import { confirmExtraction, extractSample, identifyUpload } from "@/lib/docs/service";

async function who() { const u = await getCurrentUser(); if (!u) throw new Error("Not signed in"); return u; }
export async function identifyUploadAction(hash: string) { return identifyUpload(await who(), hash); }
export async function extractSampleAction(sampleId: string) { return extractSample(await who(), String(sampleId)); }
export async function confirmExtractionAction(payload: unknown) { return confirmExtraction(await who(), payload); }
