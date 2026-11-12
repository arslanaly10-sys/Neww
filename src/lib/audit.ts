import "server-only";
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { GENESIS_HASH, auditHash } from "./hash";

/**
 * Append one event to the hash chain. Runs on the privileged connection in a transaction
 * (production: a SECURITY DEFINER function), because app_user may only INSERT, never read.
 */
export async function appendAudit(e: { actorId: string; actorRole: string; action: string; entity: string; entityId: string; detail?: unknown }) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    // One writer at a time, so two concurrent requests cannot both extend the chain from the same head.
    await tx.execute(sql`select pg_advisory_xact_lock(727002)`);
    const [last] = await tx.select().from(auditEvents).orderBy(desc(auditEvents.seq)).limit(1);
    const seq = (last?.seq ?? 0) + 1;
    const prevHash = last?.hash ?? GENESIS_HASH;
    const at = new Date();
    const core = { seq, at: at.toISOString(), actorId: e.actorId, actorRole: e.actorRole, action: e.action, entity: e.entity, entityId: e.entityId, detail: e.detail ?? {} };
    const hash = auditHash(core, prevHash);
    await tx.insert(auditEvents).values({ ...core, at, prevHash, hash });
    return { seq, hash };
  });
}
