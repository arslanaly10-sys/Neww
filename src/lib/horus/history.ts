import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { withSession } from "@/db/client";
import { horusMessages, horusThreads } from "@/db/schema";
import type { CurrentUser } from "../session";
import type { HorusAnswer, HorusMode } from "./types";

/** Saved Horus conversations. Row-level security limits every query to the signed-in user's own threads. */
const sess = (u: CurrentUser) => ({ userId: u.id, role: u.role });
const rid = (p: string) => `${p}-${randomBytes(5).toString("hex")}`;

export interface ThreadSummary { id: string; mode: HorusMode; title: string; updatedAt: string }
export interface SavedTurn { id: string; q: string; a: HorusAnswer; fileIds: string[] }

export async function listThreads(user: CurrentUser): Promise<ThreadSummary[]> {
  const rows = await withSession(sess(user), (tx) => tx.select().from(horusThreads).where(eq(horusThreads.userId, user.id)).orderBy(desc(horusThreads.updatedAt)).limit(40));
  return rows.map((r) => ({ id: r.id, mode: r.mode as HorusMode, title: r.title, updatedAt: r.updatedAt.toISOString() }));
}

export async function getThread(user: CurrentUser, id: string): Promise<{ id: string; mode: HorusMode; turns: SavedTurn[] } | null> {
  return withSession(sess(user), async (tx) => {
    const [t] = await tx.select().from(horusThreads).where(and(eq(horusThreads.id, id), eq(horusThreads.userId, user.id)));
    if (!t) return null;
    const m = await tx.select().from(horusMessages).where(eq(horusMessages.threadId, id)).orderBy(asc(horusMessages.createdAt));
    return { id: t.id, mode: t.mode as HorusMode, turns: m.map((x) => ({ id: x.id, q: x.question, a: x.answer as HorusAnswer, fileIds: x.fileIds as string[] })) };
  });
}

/** Save one question and its answer, creating the thread on the first turn. Returns the thread id. */
export async function saveTurn(user: CurrentUser, threadId: string | null, mode: HorusMode, q: string, a: HorusAnswer, fileIds: string[]): Promise<string> {
  return withSession(sess(user), async (tx) => {
    const now = new Date();
    let id = threadId;
    if (id) {
      const [t] = await tx.select({ id: horusThreads.id }).from(horusThreads).where(and(eq(horusThreads.id, id), eq(horusThreads.userId, user.id)));
      if (!t) id = null;
    }
    if (!id) {
      id = rid("T");
      await tx.insert(horusThreads).values({ id, userId: user.id, mode, title: q.slice(0, 80), createdAt: now, updatedAt: now });
    } else await tx.update(horusThreads).set({ updatedAt: now }).where(eq(horusThreads.id, id));
    await tx.insert(horusMessages).values({ id: rid("H"), threadId: id, userId: user.id, question: q, answer: a, fileIds, createdAt: now });
    return id;
  });
}

export async function deleteThread(user: CurrentUser, id: string): Promise<boolean> {
  return withSession(sess(user), async (tx) => {
    await tx.delete(horusMessages).where(and(eq(horusMessages.threadId, id), eq(horusMessages.userId, user.id)));
    const r = await tx.delete(horusThreads).where(and(eq(horusThreads.id, id), eq(horusThreads.userId, user.id))).returning({ id: horusThreads.id });
    return r.length > 0;
  });
}
