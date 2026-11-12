import "server-only";
import { getDb, withSession } from "@/db/client";
import { approvals, investorUpdates } from "@/db/schema";
import { DEMO_TODAY } from "../assumptions";
import { appendAudit } from "../audit";
import { can } from "../permissions";
import type { CurrentUser } from "../session";

/** Save a Horus draft as an unpublished investor update and route it to a different manager for approval. */
export async function saveDraftUpdate(user: CurrentUser, d: { title: string; body: string; cites: string[] }, locale: string): Promise<{ ok: true; id: string } | { ok: false; error: "forbidden" }> {
  if (!can(user.role, "update.draft")) return { ok: false, error: "forbidden" };
  const priv = await getDb();
  const uids = (await priv.select({ id: investorUpdates.id }).from(investorUpdates)).map((x) => x.id);
  const aids = (await priv.select({ id: approvals.id }).from(approvals)).map((x) => x.id);
  const next = (p: string, ids: string[], w: number) => `${p}-${String(Math.max(0, ...ids.map((i) => Number(i.split("-")[1]) || 0)) + 1).padStart(w, "0")}`;
  const id = next("U", uids, 3);
  const now = new Date();
  await withSession({ userId: user.id, role: user.role }, async (tx) => {
    // The draft is stored in the language it was written in; the other language field repeats it until a translator edits it.
    await tx.insert(investorUpdates).values({ id, postedOn: DEMO_TODAY, title: d.title, titleAr: d.title, body: d.body, bodyAr: d.body, status: "draft", authorId: user.id, assetId: null });
    await tx.insert(approvals).values({ id: next("AP", aids, 3), kind: "update_draft", refId: id, proposedBy: user.id, routeRole: "manager", status: "pending", createdAt: now });
  });
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "update.draft", entity: "investor_update", entityId: id, detail: { language: locale, drafter: "horus", cites: d.cites.slice(0, 30), title: d.title } });
  return { ok: true, id };
}
