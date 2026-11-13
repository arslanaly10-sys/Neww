import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/db/client";
import { leads } from "@/db/schema";
import { appendAudit } from "./audit";
import { queueEmail } from "./outbox";
import { rateLimited } from "./horus/gateway";
import { notify } from "./notify";

/** A demo request from the public chatbot. Stored, acknowledged and passed to the team through the simulated outbox. */
export const LeadInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  company: z.string().trim().max(160).default(""),
  message: z.string().trim().max(1000).default(""),
  website: z.string().max(0).optional(), // honeypot: people never see this field
});
export const SALES_INBOX = "demo@zmnhoof.example";

export type LeadResult = { ok: true; id: string } | { ok: false; error: "invalid" | "rate_limit"; fields?: string[] };

export async function submitLead(raw: unknown, locale: "en" | "ar", ip: string): Promise<LeadResult> {
  const p = LeadInput.safeParse(raw);
  if (!p.success) return { ok: false, error: "invalid", fields: [...new Set(p.error.issues.map((i) => String(i.path[0])))] };
  if (rateLimited(`lead|${ip}`, Date.now(), 5)) return { ok: false, error: "rate_limit" };
  const d = p.data;
  const id = `L-${randomBytes(4).toString("hex")}`;
  await (await getDb()).insert(leads).values({ id, name: d.name, email: d.email, company: d.company, message: d.message, locale, status: "new", createdAt: new Date() });
  const ar = locale === "ar";
  await queueEmail({
    kind: "lead_ack", to: d.email, refId: id,
    subject: ar ? "استلمنا طلب العرض" : "We received your demo request",
    body: ar ? `مرحبًا ${d.name}،\n\nشكرًا لاهتمامك بـ ZMNHOOF OS. سيتواصل معك فريقنا قريبًا لترتيب عرض على محفظتك.\n\nفريق ZMNHOOF` : `Hello ${d.name},\n\nThank you for your interest in ZMNHOOF OS. Our team will contact you shortly to arrange a demo with your portfolio.\n\nThe ZMNHOOF team`,
  }, "public");
  await queueEmail({
    kind: "lead_notify", to: SALES_INBOX, refId: id,
    subject: `New demo request: ${d.name}${d.company ? ` (${d.company})` : ""}`,
    body: `Name: ${d.name}\nEmail: ${d.email}\nCompany: ${d.company || "-"}\nLanguage: ${locale}\n\n${d.message || "(no message)"}`,
  }, "public");
  await appendAudit({ actorId: "public", actorRole: "public", action: "lead.create", entity: "lead", entityId: id, detail: { company: d.company, locale } });
  await notify({ to: { roles: ["manager", "admin"] }, kind: "lead_new", params: { name: d.name, company: d.company || "-" }, link: "/governance#outbox" });
  return { ok: true, id };
}
