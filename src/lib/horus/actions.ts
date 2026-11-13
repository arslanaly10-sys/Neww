import "server-only";
import { z } from "zod";
import { appendAudit } from "../audit";
import { can } from "../permissions";
import { snoozeAlert } from "../alerts-service";
import { queueEmail } from "../outbox";
import type { CurrentUser } from "../session";

/**
 * A person confirming something Horus prepared. Nothing here trusts the model: the action is re-validated, the role
 * is checked again, and the work goes through the same service the page itself uses. Every confirmation is audited.
 */
const Action = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("snooze_alert"), alertKey: z.string().min(1).max(120), reason: z.string().max(200) }),
  z.object({ kind: z.literal("start_valuation"), assetId: z.string().regex(/^A-\d{3}$/) }),
  z.object({ kind: z.literal("draft_email"), to: z.string().email().max(120), subject: z.string().min(1).max(200), body: z.string().min(1).max(4000) }),
]);

export type ConfirmResult = { ok: true; kind: string; href?: string; id?: string } | { ok: false; error: "invalid" | "forbidden" | "not_found" | "reason_required" };

export async function confirmHorusAction(user: CurrentUser, raw: unknown): Promise<ConfirmResult> {
  const p = Action.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid" };
  const a = p.data;
  if (!can(user.role, "horus.use")) return { ok: false, error: "forbidden" };
  const audit = (detail: Record<string, unknown>) => appendAudit({ actorId: user.id, actorRole: user.role, action: "horus.action_confirm", entity: "horus", entityId: a.kind, detail });

  switch (a.kind) {
    case "snooze_alert": {
      const r = await snoozeAlert(user, a.alertKey, a.reason.trim() || "Snoozed from Horus");
      if (!r.ok) return { ok: false, error: r.error === "reason_required" ? "reason_required" : r.error };
      await audit({ alertKey: a.alertKey });
      return { ok: true, kind: a.kind };
    }
    case "start_valuation": {
      if (!can(user.role, "valuation.run")) return { ok: false, error: "forbidden" };
      await audit({ assetId: a.assetId });
      return { ok: true, kind: a.kind, href: `/valuation?asset=${a.assetId}` };
    }
    case "draft_email": {
      if (!can(user.role, "horus.email")) return { ok: false, error: "forbidden" };
      const id = await queueEmail({ kind: "horus_email", to: a.to, subject: a.subject, body: a.body }, user);
      await audit({ outboxId: id, to: a.to, subject: a.subject });
      return { ok: true, kind: a.kind, id };
    }
  }
}
