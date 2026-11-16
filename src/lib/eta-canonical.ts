import { createHash } from "node:crypto";

/**
 * The Egyptian Tax Authority signs a document's "canonical" text, not its JSON. This follows the published
 * serialisation rules as implemented here: each property becomes its upper-case name in quotes followed by its
 * value; a simple value is written in quotes; an array writes its name once, then each item prefixed by the name
 * again. Validate against the ETA SDK before relying on it in production.
 */
export function canonical(v: unknown): string {
  if (v === null || v === undefined) return '""';
  if (typeof v !== "object") return `"${String(v)}"`;
  let out = "";
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const K = `"${k.toUpperCase()}"`;
    if (Array.isArray(val)) { out += K; for (const item of val) out += K + canonical(item); }
    else out += K + canonical(val);
  }
  return out;
}

export const canonicalHash = (doc: unknown) => createHash("sha256").update(canonical(doc), "utf8").digest("hex");
