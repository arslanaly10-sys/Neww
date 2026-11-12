import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DocKind } from "./extract";

/** The three bundled sample documents and the records they relate to. */
export const SAMPLES = [
  { id: "lease-en", file: "sample-lease-en.pdf", kind: "lease" as DocKind, assetId: "A-001", docId: "D-101", leaseId: "L-011", language: "en" },
  { id: "deed-ar", file: "sample-deed-ar.pdf", kind: "deed" as DocKind, assetId: "A-002", docId: "D-106", leaseId: null, language: "ar" },
  { id: "lease-bilingual", file: "sample-lease-bilingual.pdf", kind: "lease" as DocKind, assetId: "A-013", docId: "D-142", leaseId: "L-018", language: "bilingual" },
] as const;
export type Sample = (typeof SAMPLES)[number];

const dir = () => path.join(process.cwd(), "public/samples");
export async function readSample(s: Sample) { return new Uint8Array(await readFile(path.join(dir(), s.file))); }
export const sha256Bytes = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** Match an uploaded file, by its SHA-256, to one of the bundled samples. Anything else is not read. */
export async function identifySample(hash: string): Promise<Sample | null> {
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  const manifest = JSON.parse(await readFile(path.join(dir(), "manifest.json"), "utf8")) as { file: string; sha256: string }[];
  const hit = manifest.find((m) => m.sha256 === hash);
  const sample = SAMPLES.find((s) => s.file === hit?.file);
  if (!sample) return null;
  return sha256Bytes(await readSample(sample)) === hash ? sample : null; // re-check the bytes on disk, not just the manifest
}
