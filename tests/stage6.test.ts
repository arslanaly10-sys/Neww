import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9" }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { auditEvents, leads, outbox } from "../src/db/schema";
import { ARTICLES, searchHelp } from "../src/lib/help/articles";
import { classify } from "../src/lib/horus/scripted";
import { askHorus, askPublic, _resetRateLimit } from "../src/lib/horus/gateway";
import { deleteThread, getThread, listThreads, saveTurn } from "../src/lib/horus/history";
import { saveHorusFile, listHorusFiles } from "../src/lib/horus/files";
import { confirmHorusAction } from "../src/lib/horus/actions";
import { resolveCitation } from "../src/lib/horus/citations";
import { submitLead } from "../src/lib/leads";
import { getLeadsAndOutbox } from "../src/lib/outbox";
import type { CurrentUser } from "../src/lib/session";

process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), "zos-up-"));
const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const mgr = U("u-manager-1", "manager"), mgr2 = U("u-manager-2", "manager"), inv = U("u-investor", "investor"), adm = U("u-admin", "admin");

type Resp = { stop_reason: string; content: unknown[] };
const toolUse = (name: string, input: unknown, id = Math.random().toString(36).slice(2)) => ({ type: "tool_use", id, name, input });
function fake(script: Resp[]) {
  const calls: Record<string, unknown>[] = [];
  let i = 0;
  return { calls, client: { messages: { create: async (req: Record<string, unknown>) => { calls.push(JSON.parse(JSON.stringify(req))); return script[Math.min(i++, script.length - 1)]; } } } as never };
}

describe("help knowledge base", () => {
  it("every article is bilingual and ids are unique", () => {
    expect(new Set(ARTICLES.map((a) => a.id)).size).toBe(ARTICLES.length);
    for (const a of ARTICLES) for (const l of ["en", "ar"] as const) { expect(a.title[l].length).toBeGreaterThan(3); expect(a.body[l].length).toBeGreaterThan(40); }
  });
  it("finds the right article in English and Arabic, with typos in word endings", () => {
    expect(searchHelp("How do I approve a valuation?")[0].article.id).toBe("valuation");
    expect(searchHelp("كيف أعتمد تقييمًا؟")[0].article.id).toBe("valuation");
    expect(searchHelp("what can investors see")[0].article.id).toBe("roles");
    expect(searchHelp("is my data secure")[0].article.id).toBe("security");
  });
  it("public search never returns an inside-the-app article", () => {
    expect(searchHelp("how do I approve a valuation", { publicOnly: true }).every((h) => h.article.public)).toBe(true);
    expect(searchHelp("xyzzy plugh")).toEqual([]);
  });
});

describe("scripted intents for actions and files", () => {
  it("classifies snooze, start-valuation, email and file questions", () => {
    expect(classify("Snooze the most urgent alert").intent).toBe("snooze");
    expect(classify("Start a valuation for A-007")).toEqual({ intent: "startval", assetId: "A-007" });
    expect(classify("Tell me about A-007")).toEqual({ intent: "asset", assetId: "A-007" });
    expect(classify("Draft an email to the investor").intent).toBe("email");
    expect(classify("Summarise this file", true).intent).toBe("file");
    expect(classify("Summarise this file", false).intent).toBeNull();
    expect(classify("أجّل التنبيه").intent).toBe("snooze");
  });

  it("manager: snooze proposes an action on a real open alert; the investor is refused", async () => {
    const a = await askHorus(mgr, "Snooze the most urgent alert", "en", "EGP", { apiKey: undefined, ip: "s1" });
    expect(a.actions?.[0]?.kind).toBe("snooze_alert");
    expect(a.blocks[0].cites.some((c) => c.startsWith("alert:"))).toBe(true);
    const i = await askHorus(inv, "Snooze the most urgent alert", "en", "EGP", { apiKey: undefined, ip: "s2" });
    expect(i.actions ?? []).toHaveLength(0);
  });

  it("start a valuation and draft an email (scripted), in Arabic too", async () => {
    const v = await askHorus(inv, "Start a valuation for A-003", "en", "EGP", { apiKey: undefined, ip: "s3" });
    expect(v.actions).toEqual([expect.objectContaining({ kind: "start_valuation", assetId: "A-003" })]);
    const e = await askHorus(mgr, "اكتب بريدًا إلى المستثمر", "ar", "EGP", { apiKey: undefined, ip: "s4" });
    expect(e.actions?.[0]).toMatchObject({ kind: "draft_email", to: "karim@sample.test" });
    expect((e.actions?.[0] as { body: string }).body).toContain("عزيزي");
  });
});

describe("live path: actions, history and help (fake client)", () => {
  beforeEach(() => _resetRateLimit());

  it("keeps a proposed snooze only for an alert a tool returned, and only for a manager", async () => {
    const alertsOut = await askHorus(mgr, "Snooze the most urgent alert", "en", "EGP", { apiKey: undefined, ip: "l0" });
    const key = (alertsOut.actions![0] as { alertKey: string }).alertKey;
    const script = (k: string): Resp[] => [
      { stop_reason: "tool_use", content: [toolUse("open_alerts", {})] },
      { stop_reason: "tool_use", content: [toolUse("propose_action", { kind: "snooze_alert", alertKey: k, reason: "Renewal talks under way" }), toolUse("propose_action", { kind: "snooze_alert", alertKey: "made_up:A-999", reason: "x" })] },
      { stop_reason: "tool_use", content: [toolUse("submit_answer", { blocks: [{ text: "Ready to confirm.", cites: [`alert:${k}`] }], cannot_verify: false })] },
    ];
    const a = await askHorus(mgr, "Snooze it", "en", "EGP", { client: fake(script(key)).client, apiKey: "k", ip: "l1" });
    expect(a.mode).toBe("live");
    expect(a.actions).toEqual([expect.objectContaining({ kind: "snooze_alert", alertKey: key, reason: "Renewal talks under way" })]);
  });

  it("drops a drafted email with an invented number, and any email from an investor", async () => {
    const script = (body: string): Resp[] => [
      { stop_reason: "tool_use", content: [toolUse("portfolio_summary", {})] },
      { stop_reason: "tool_use", content: [toolUse("propose_action", { kind: "draft_email", to: "karim@sample.test", subject: "Update", body })] },
      { stop_reason: "tool_use", content: [toolUse("submit_answer", { blocks: [{ text: "Drafted.", cites: ["calc:portfolio_summary"] }], cannot_verify: false })] },
    ];
    const bad = await askHorus(mgr, "Email Karim", "en", "EGP", { client: fake(script("We hold 31 assets worth EGP 9bn.")).client, apiKey: "k", ip: "l2" });
    expect(bad.actions).toEqual([]);
    const ok = await askHorus(mgr, "Email Karim", "en", "EGP", { client: fake(script("The portfolio holds 30 assets.")).client, apiKey: "k", ip: "l3" });
    expect(ok.actions?.[0]).toMatchObject({ kind: "draft_email" });
    const inv1 = await askHorus(inv, "Email Karim", "en", "EGP", { client: fake(script("The portfolio holds 30 assets.")).client, apiKey: "k", ip: "l4" });
    expect(inv1.actions).toEqual([]);
  });

  it("sends earlier turns as context for a follow-up and reports each tool as a step", async () => {
    const f = fake([
      { stop_reason: "tool_use", content: [toolUse("portfolio_summary", {})] },
      { stop_reason: "tool_use", content: [toolUse("submit_answer", { blocks: [{ text: "30 assets.", cites: ["calc:portfolio_summary"] }], cannot_verify: false })] },
    ]);
    const steps: string[] = [];
    const prev = { q: "How many assets?", a: { question: "How many assets?", mode: "live" as const, notice: null, blocks: [{ text: "There are 30.", cites: ["calc:portfolio_summary"] }], cannotVerify: false, dropped: 0, draft: null, advice: false } };
    await askHorus(mgr, "And how many are vacant?", "en", "EGP", { client: f.client, apiKey: "k", ip: "l5" }, { history: [prev], onStep: (s) => steps.push(s) });
    const msgs = (f.calls[0] as { messages: { role: string; content: unknown }[] }).messages;
    expect(msgs.slice(0, 3).map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(msgs[1].content).toBe("There are 30.");
    expect(steps).toEqual(["portfolio_summary"]);
  });

  it("help mode: only help articles may be cited, and no portfolio tools are offered", async () => {
    const f = fake([{ stop_reason: "tool_use", content: [toolUse("submit_answer", { blocks: [{ text: "A different manager approves it.", cites: ["help:valuation"] }, { text: "Portfolio is EGP 1bn.", cites: ["calc:portfolio_summary"] }], cannot_verify: false })] }]);
    const a = await askHorus(adm, "How do I approve a valuation?", "en", "EGP", { client: f.client, apiKey: "k", ip: "l6" }, { mode: "help" });
    expect(a.blocks.map((b) => b.cites)).toEqual([["help:valuation"]]);
    expect((f.calls[0] as { tools: { name: string }[] }).tools.map((t) => t.name)).toEqual(["submit_answer"]);
    expect(a.help?.[0]?.id).toBe("valuation");
  });

  it("the administrator may use help but not portfolio questions", async () => {
    const a = await askHorus(adm, "What is the portfolio worth?", "en", "EGP", { apiKey: undefined, ip: "l7" });
    expect(a.blocks).toEqual([]);
    const h = await askHorus(adm, "What can each role see?", "en", "EGP", { apiKey: undefined, ip: "l8" }, { mode: "help" });
    expect(h.blocks[0].cites).toEqual(["help:roles"]);
  });
});

describe("conversation history (row-level security)", () => {
  it("saves turns into a thread, lists it only for its owner, and deletes it", async () => {
    const a = await askHorus(mgr, "What is the total portfolio value?", "en", "EGP", { apiKey: undefined, ip: "h1" });
    const id = await saveTurn(mgr, null, "portfolio", "What is the total portfolio value?", a, []);
    const id2 = await saveTurn(mgr, id, "portfolio", "Again", a, []);
    expect(id2).toBe(id);
    expect((await getThread(mgr, id))!.turns.map((t) => t.q)).toEqual(["What is the total portfolio value?", "Again"]);
    expect((await listThreads(mgr)).some((t) => t.id === id)).toBe(true);
    expect(await getThread(mgr2, id)).toBeNull();
    expect((await listThreads(mgr2)).some((t) => t.id === id)).toBe(false);
    expect(await deleteThread(mgr2, id)).toBe(false);
    // Someone else's thread id is ignored: the turn starts a new thread for the caller.
    expect(await saveTurn(mgr2, id, "portfolio", "Hijack", a, [])).not.toBe(id);
    expect(await deleteThread(mgr, id)).toBe(true);
    expect(await getThread(mgr, id)).toBeNull();
  });
});

describe("files for Horus", () => {
  it("saves a text file, reads it in a scripted answer, and keeps it private to its owner", async () => {
    const file = new File(["Lease agreement between Sample Landlord and Nile Tenant.\nStart date 2026-01-01. Monthly rent EGP 85,000. Ends 31/12/2027."], "lease.txt", { type: "text/plain" });
    const r = await saveHorusFile(mgr, file);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = await askHorus(mgr, "Summarise this file", "en", "EGP", { apiKey: undefined, ip: "f1" }, { fileIds: [r.file.id] });
    const all = a.blocks.map((b) => b.text).join(" ");
    expect(all).toContain("lease.txt");
    expect(all).toContain("2026-01-01");
    expect(all).toContain("EGP 85,000");
    expect(a.blocks[0].cites).toEqual([`file:${r.file.id}`]);
    expect((await listHorusFiles(mgr2)).some((f) => f.id === r.file.id)).toBe(false);
    expect(await resolveCitation(mgr2, `file:${r.file.id}`, "en", "EGP")).toBeNull();
    expect((await resolveCitation(mgr, `file:${r.file.id}`, "en", "EGP"))?.title).toContain("lease.txt");
    // A file id that was not attached to the question cannot be read.
    const b = await askHorus(mgr2, "Summarise this file", "en", "EGP", { apiKey: undefined, ip: "f2" }, { fileIds: [r.file.id] });
    expect(b.cannotVerify).toBe(true);
  });
  it("rejects empty, oversized and unsupported files, and the administrator", async () => {
    expect(await saveHorusFile(mgr, new File([], "x.txt", { type: "text/plain" }))).toEqual({ ok: false, error: "empty" });
    expect(await saveHorusFile(mgr, new File([new Uint8Array(9 * 1024 * 1024)], "big.pdf", { type: "application/pdf" }))).toEqual({ ok: false, error: "too_large" });
    expect(await saveHorusFile(mgr, new File(["MZ"], "tool.exe", { type: "application/octet-stream" }))).toEqual({ ok: false, error: "unsupported" });
    expect(await saveHorusFile(adm, new File(["hi"], "a.txt", { type: "text/plain" }))).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("confirming actions", () => {
  it("snooze goes through the alerts service and is audited; invalid or forbidden actions are refused", async () => {
    const a = await askHorus(mgr, "Snooze the most urgent alert", "en", "EGP", { apiKey: undefined, ip: "c1" });
    const act = a.actions![0];
    expect(await confirmHorusAction(inv, act)).toMatchObject({ ok: false });
    expect(await confirmHorusAction(mgr, act)).toEqual({ ok: true, kind: "snooze_alert" });
    expect(await confirmHorusAction(mgr, act)).toEqual({ ok: false, error: "not_found" }); // already snoozed
    expect(await confirmHorusAction(mgr, { kind: "delete_everything" })).toEqual({ ok: false, error: "invalid" });
    const db = await getDb();
    expect((await db.select().from(auditEvents).where(eq(auditEvents.action, "horus.action_confirm"))).length).toBeGreaterThan(0);
  });
  it("start a valuation returns the pre-filled page; an email goes to the outbox, managers only", async () => {
    expect(await confirmHorusAction(inv, { kind: "start_valuation", assetId: "A-002" })).toEqual({ ok: true, kind: "start_valuation", href: "/valuation?asset=A-002" });
    const mail = { kind: "draft_email", to: "karim@sample.test", subject: "Update", body: "Hello" };
    expect(await confirmHorusAction(inv, mail)).toEqual({ ok: false, error: "forbidden" });
    const r = await confirmHorusAction(mgr, mail);
    expect(r).toMatchObject({ ok: true, kind: "draft_email" });
    const db = await getDb();
    expect((await db.select().from(outbox).where(eq(outbox.id, (r as { id: string }).id)))[0]).toMatchObject({ to: "karim@sample.test", createdBy: "u-manager-1" });
  });
});

describe("public chatbot and demo requests", () => {
  beforeEach(() => _resetRateLimit());
  it("answers visitors from public articles only, and never with portfolio data", async () => {
    const a = await askPublic("What is ZMNHOOF OS?", "en", { apiKey: undefined, ip: "p1" });
    expect(a.blocks[0].cites).toEqual(["help:what-is"]);
    const b = await askPublic("How do I approve a valuation?", "en", { apiKey: undefined, ip: "p2" });
    expect(b.blocks.flatMap((x) => x.cites).every((c) => ARTICLES.find((x) => `help:${x.id}` === c)?.public)).toBe(true);
    const f = fake([{ stop_reason: "tool_use", content: [toolUse("submit_answer", { blocks: [{ text: "Approve it on the Valuation page.", cites: ["help:valuation"] }], cannot_verify: false })] }]);
    const c = await askPublic("How do I approve a valuation?", "en", { client: f.client, apiKey: "k", ip: "p3" });
    expect(c.blocks).toEqual([]); // help:valuation is not public, so the claim is removed
  });
  it("rate-limits visitors per address", async () => {
    for (let i = 0; i < 30; i++) await askPublic("What is ZMNHOOF OS?", "en", { apiKey: "k", client: fake([{ stop_reason: "tool_use", content: [toolUse("submit_answer", { blocks: [], cannot_verify: true })] }]).client, ip: "p4" });
    expect((await askPublic("What is ZMNHOOF OS?", "en", { apiKey: "k", ip: "p4" })).notice).toBe("rate_limit");
  });
  it("stores a demo request, queues two emails, and shows it only to managers and the administrator", async () => {
    expect(await submitLead({ name: "", email: "nope" }, "en", "d1")).toMatchObject({ ok: false, error: "invalid", fields: ["name", "email"] });
    expect(await submitLead({ name: "Bot", email: "b@x.io", website: "spam" }, "en", "d1")).toMatchObject({ ok: false, error: "invalid" });
    const r = await submitLead({ name: "Mona Fathy", email: "mona@example.com", company: "Fathy Holdings", message: "Twelve units in Zamalek." }, "ar", "d2");
    expect(r.ok).toBe(true);
    const db = await getDb();
    const id = (r as { id: string }).id;
    expect((await db.select().from(leads).where(eq(leads.id, id)))[0]).toMatchObject({ email: "mona@example.com", locale: "ar", status: "new" });
    const mails = await db.select().from(outbox).where(eq(outbox.refId, id));
    expect(mails.map((m) => m.kind).sort()).toEqual(["lead_ack", "lead_notify"]);
    expect(mails.find((m) => m.kind === "lead_ack")!.subject).toBe("استلمنا طلب العرض");
    expect((await getLeadsAndOutbox(adm))!.leads.some((l) => l.id === id)).toBe(true);
    expect((await getLeadsAndOutbox(mgr))!.leads.some((l) => l.id === id)).toBe(true);
    expect(await getLeadsAndOutbox(inv)).toBeNull();
    for (let i = 0; i < 5; i++) await submitLead({ name: "Same Person", email: "s@example.com" }, "en", "d3");
    expect(await submitLead({ name: "Same Person", email: "s@example.com" }, "en", "d3")).toEqual({ ok: false, error: "rate_limit" });
  });
});
