import { createHash } from "node:crypto";

/** Deterministic JSON: keys sorted, so the same content always hashes the same. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const GENESIS_HASH = "0".repeat(64);

export interface AuditCore {
  seq: number; at: string; actorId: string; actorRole: string;
  action: string; entity: string; entityId: string; detail: unknown;
}
export const auditHash = (e: AuditCore, prevHash: string) => sha256(canonical({ ...e, prevHash }));
