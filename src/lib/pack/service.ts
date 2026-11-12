import "server-only";
import React from "react";
import { createTranslator } from "next-intl";
import { desc, eq, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditEvents, packExports } from "@/db/schema";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import { SAMPLE_FX_EGP_PER_USD } from "../assumptions";
import { appendAudit } from "../audit";
import { can } from "../permissions";
import type { CurrentUser } from "../session";
import { PackDocument, type Tr } from "./document";
import { buildPackModel, contentHash, verificationHash } from "./model";

const MSG = { en, ar } as const;
const tr = (lang: "en" | "ar", namespace: string): Tr => {
  const t = createTranslator({ locale: lang, messages: MSG[lang] as never, namespace: namespace as never }) as unknown as (k: string, p?: Record<string, string | number>) => string;
  return (k, p) => t(k, p);
};

export async function generatePack(user: CurrentUser, lang: "en" | "ar", currency: "EGP" | "USD") {
  if (!can(user.role, "pack.generate")) return { ok: false as const, error: "forbidden" as const };
  const model = await buildPackModel(user, lang, currency, SAMPLE_FX_EGP_PER_USD);
  const content = contentHash(model);
  const verification = verificationHash(content, model);
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const buffer = await renderToBuffer(React.createElement(PackDocument, { m: model, t: tr(lang, "pack"), ta: tr(lang, "assetx"), ty: tr(lang, "types"), hashes: { content, verification } }) as never);

  const db = await getDb();
  const ids = (await db.select({ id: packExports.id }).from(packExports)).map((x) => x.id);
  const id = `P-${String(Math.max(0, ...ids.map((i) => Number(i.split("-")[1]) || 0)) + 1).padStart(4, "0")}`;
  await db.insert(packExports).values({ id, contentHash: content, verificationHash: verification, headSeq: model.audit.headSeq, headHash: model.audit.headHash, generatedBy: user.id, role: user.role, lang, at: new Date() });
  await appendAudit({ actorId: user.id, actorRole: user.role, action: "pack.generate", entity: "pack", entityId: id, detail: { lang, currency, contentHash: content, verificationHash: verification, chainHeadSeq: model.audit.headSeq } });
  return { ok: true as const, id, buffer, content, verification, model };
}

export interface Verification { found: boolean; id?: string; lang?: string; at?: string; role?: string; headSeq?: number; chainIntact?: boolean; matched?: "verification" | "content" }

/** Answers "was this pack issued here, and does the audit chain still contain the head it was bound to?" without revealing any content. */
export async function verifyPack(hash: string): Promise<Verification> {
  const h = String(hash ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(h)) return { found: false };
  const db = await getDb();
  const [row] = await db.select().from(packExports).where(or(eq(packExports.verificationHash, h), eq(packExports.contentHash, h))).orderBy(desc(packExports.at)).limit(1);
  if (!row) return { found: false };
  const [ev] = await db.select().from(auditEvents).where(eq(auditEvents.seq, row.headSeq));
  return { found: true, id: row.id, lang: row.lang, at: row.at.toISOString(), role: row.role, headSeq: row.headSeq, chainIntact: !!ev && ev.hash === row.headHash, matched: row.verificationHash === h ? "verification" : "content" };
}
