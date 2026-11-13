import "server-only";
import { randomBytes } from "node:crypto";
import { desc } from "drizzle-orm";
import { getDb, withSession } from "@/db/client";
import { leads, outbox } from "@/db/schema";
import { can } from "./permissions";
import type { CurrentUser } from "./session";

/**
 * Simulated email. Every message the app would send is written to the outbox table instead; nothing leaves the
 * server. Replacing this one function with a real provider (Resend, SMTP) is all it takes to send for real.
 */
export interface Mail { kind: string; to: string; subject: string; body: string; refId?: string | null }

export async function queueEmail(m: Mail, by: CurrentUser | "public"): Promise<string> {
  const id = `M-${randomBytes(5).toString("hex")}`;
  const row = { id, kind: m.kind, to: m.to, subject: m.subject, body: m.body, refId: m.refId ?? null, createdBy: by === "public" ? "public" : by.id, createdAt: new Date() };
  if (by === "public") await (await getDb()).insert(outbox).values(row);
  else await withSession({ userId: by.id, role: by.role }, (tx) => tx.insert(outbox).values(row));
  return id;
}

/** The latest demo requests and outbox messages, for managers and the administrator. */
export async function getLeadsAndOutbox(user: CurrentUser) {
  if (!can(user.role, "leads.view")) return null;
  return withSession({ userId: user.id, role: user.role }, async (tx) => ({
    leads: await tx.select().from(leads).orderBy(desc(leads.createdAt)).limit(20),
    outbox: await tx.select().from(outbox).orderBy(desc(outbox.createdAt)).limit(20),
  }));
}
