import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4" }) }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const en = (await import("../messages/en.json")).default, ar = (await import("../messages/ar.json")).default;
  return { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => createTranslator({ locale, messages: (locale === "ar" ? ar : en) as never, namespace: namespace as never }) };
});
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { approvals, auditEvents, investorUpdates } from "../src/db/schema";
import { numbersIn, validateAnswer } from "../src/lib/horus/validate";
import { classify, scriptedAnswer, SUGGESTED } from "../src/lib/horus/scripted";
import { askHorus, _resetRateLimit } from "../src/lib/horus/gateway";
import { resolveCitation } from "../src/lib/horus/citations";
import { runTool } from "../src/lib/horus/tools";
import { saveDraftUpdate } from "../src/lib/horus/drafts";
import { CITE_RE, type HorusCtx } from "../src/lib/horus/types";
import type { CurrentUser } from "../src/lib/session";

const U = (id: string, role: CurrentUser["role"]): CurrentUser => ({ id, role, name: id, nameAr: id, title: "", titleAr: "" });
const mgr = U("u-manager-1", "manager"), inv = U("u-investor", "investor"), adm = U("u-admin", "admin");
const ctx = (u: CurrentUser, locale = "en"): HorusCtx => ({ user: { id: u.id, name: u.name, role: u.role }, locale, currency: "EGP", fx: 50 });

describe("grounding validator", () => {
  const allowed = new Set(["asset:A-001", "calc:portfolio_summary"]);
  const ground = JSON.stringify({ data: { value: { display: "EGP 1.03bn", full: "EGP 1,025,563,000" }, count: 30, yield: "5.2%" } });
  it("extracts numbers, handling commas and Arabic-Indic digits", () => {
    expect(numbersIn("EGP 1,025,563,000 and 5.2% in ٣٠ assets")).toEqual(["1025563000", "5.2", "30"]);
  });
  it("keeps a cited block whose numbers all came from tools", () => {
    const v = validateAnswer([{ text: "30 assets worth EGP 1.03bn, yield 5.2%.", cites: ["calc:portfolio_summary"] }], null, allowed, ground);
    expect(v.kept).toHaveLength(1);
    expect(v.dropped).toBe(0);
  });
  it("drops a block with no citation", () => {
    expect(validateAnswer([{ text: "Something true.", cites: [] }], null, allowed, ground).dropped).toBe(1);
  });
  it("drops a block citing an id no tool returned", () => {
    expect(validateAnswer([{ text: "Fine.", cites: ["asset:A-999"] }], null, allowed, ground).kept).toHaveLength(0);
    expect(validateAnswer([{ text: "Fine.", cites: ["not-a-valid-id"] }], null, allowed, ground).kept).toHaveLength(0);
  });
  it("drops a block containing a number the model computed or invented", () => {
    const v = validateAnswer([{ text: "That is EGP 2.5bn in total.", cites: ["calc:portfolio_summary"] }, { text: "Yield is 6.1%.", cites: ["calc:portfolio_summary"] }], null, allowed, ground);
    expect(v.kept).toHaveLength(0);
    expect(v.reasons.join(" ")).toContain("number not returned");
  });
  it("keeps valid blocks and drops only the bad ones; checks drafts too", () => {
    const v = validateAnswer(
      [{ text: "30 assets.", cites: ["calc:portfolio_summary"] }, { text: "99 assets.", cites: ["calc:portfolio_summary"] }],
      { title: "Update", body: "The yield is 7.7%.", cites: ["calc:portfolio_summary"] }, allowed, ground);
    expect(v.kept).toHaveLength(1);
    expect(v.draft).toBeNull();
    expect(v.dropped).toBe(2);
  });
  it("ignores JSON key names when grounding numbers", async () => {
    const { groundText } = await import("../src/lib/horus/validate");
    const g = groundText({ data: { netYield12m: "5.2%", count: 30 }, cites: ["asset:A-001"] });
    expect(numbersIn(g)).toEqual(["001", "5.2", "30"]);
  });
  it("cite id grammar", () => {
    for (const id of ["asset:A-001", "lease:L-011", "valuation:V-0001", "market:new-cairo", "doc:D-101", "update:U-001", "sale:S-0001", "calc:portfolio_summary"]) expect(CITE_RE.test(id)).toBe(true);
    for (const id of ["asset:", "x:1", "asset:A 001", "asset:<script>"]) expect(CITE_RE.test(id)).toBe(false);
  });
});

describe("question classification", () => {
  it("recognises the twelve intents in English and Arabic", () => {
    const cases: [string, string][] = [
      ["What is the total portfolio value?", "value"], ["What is the unrealised gain?", "gain"], ["What is the net yield?", "yield"], ["How many income-producing units?", "units"],
      ["Which assets are vacant?", "vacant"], ["Which leases end soon?", "expiring"], ["Which documents are missing?", "docs"], ["What are the largest holdings?", "largest"],
      ["How concentrated by district?", "concentration"], ["Which districts are cooling?", "market"], ["Explain the latest valuation", "valuation"], ["Draft the investor update", "draft"],
      ["كم تبلغ القيمة الإجمالية للمحفظة؟", "value"], ["كم المكسب غير المحقق؟", "gain"], ["ما الأصول الشاغرة؟", "vacant"], ["ما العقود التي تنتهي قريباً؟", "expiring"],
      ["ما المستندات الناقصة أو المنتهية؟", "docs"], ["ما أكبر الأصول قيمةً؟", "largest"], ["اشرح آخر تقييم", "valuation"], ["صُغ مسودة مستجدات المستثمرين", "draft"],
    ];
    for (const [q, i] of cases) expect(classify(q).intent, q).toBe(i);
    expect(classify("Tell me about A-012")).toEqual({ intent: "asset", assetId: "A-012" });
    expect(classify("should I sell Zamalek?").intent).toBe("advice");
    expect(classify("هل أبيع أصول الزمالك؟").intent).toBe("advice");
    expect(classify("what is the meaning of life").intent).toBeNull();
  });
});

describe("scripted answers", () => {
  for (const locale of ["en", "ar"]) {
    it(`answers every suggested question with resolvable citations (${locale})`, async () => {
      for (const intent of SUGGESTED) {
        const q = (await import(`../messages/${locale}.json`)).default.horus[`q_${intent}`] as string;
        const a = await scriptedAnswer(q, ctx(mgr, locale), "no_key");
        expect(a.cannotVerify, `${intent} ${locale}`).toBe(false);
        expect(a.blocks.length + (a.draft ? 1 : 0), intent).toBeGreaterThan(0);
        for (const b of a.blocks) {
          expect(b.text.length).toBeGreaterThan(10);
          expect(b.cites.length, `${intent}: ${b.text}`).toBeGreaterThan(0);
          for (const c of b.cites) {
            expect(CITE_RE.test(c)).toBe(true);
            const r = await resolveCitation(mgr, c, locale, "EGP");
            expect(r, `${intent} cite ${c}`).not.toBeNull();
            expect(r!.rows.length).toBeGreaterThan(0);
          }
        }
        if (locale === "ar") expect(a.blocks.map((b) => b.text).join(" ")).toMatch(/[؀-ۿ]/);
      }
    });
  }
  it("says it cannot verify what it does not understand, and declines advice", async () => {
    expect((await scriptedAnswer("what is the meaning of life", ctx(mgr), "no_key")).cannotVerify).toBe(true);
    const adv = await scriptedAnswer("Should I sell my Zamalek flat?", ctx(mgr), "no_key");
    expect(adv.advice).toBe(true);
    expect(adv.blocks).toHaveLength(0);
  });
  it("answers about a named asset and an unknown asset", async () => {
    const a = await scriptedAnswer("Tell me about A-011", ctx(mgr), null);
    expect(a.blocks.map((b) => b.text).join(" ")).toContain("A-011");
    expect((await scriptedAnswer("Tell me about A-099", ctx(mgr), null)).cannotVerify).toBe(true);
  });
  it("reports the right vacancies from the data", async () => {
    const a = await scriptedAnswer("Which assets are vacant?", ctx(mgr), null);
    expect(a.blocks[0].text).toMatch(/Lotus Residences 9C/);
    expect(a.blocks[0].text).toMatch(/4 assets are vacant/);
  });
  it("only managers get a draft; the draft cites its sources", async () => {
    const m = await scriptedAnswer("Draft the investor update", ctx(mgr), null);
    expect(m.draft?.body).toMatch(/sample data/i);
    expect(m.draft!.cites.length).toBeGreaterThan(2);
    const i = await scriptedAnswer("Draft the investor update", ctx(inv), null);
    expect(i.draft).toBeNull();
  });
});

describe("role filtering inside the tools", () => {
  it("hides rent from an investor and shows it to a manager, in the tool output and in the citation", async () => {
    const asInv = JSON.stringify((await runTool("asset_detail", { assetId: "A-001" }, ctx(inv))).data);
    const asMgr = JSON.stringify((await runTool("asset_detail", { assetId: "A-001" }, ctx(mgr))).data);
    expect(asInv).toContain("hidden for this role");
    expect(asMgr).not.toContain("hidden for this role");
    const cInv = await resolveCitation(inv, "lease:L-011", "en", "EGP");
    expect(cInv!.rows.find((r) => r.label === "Monthly rent")!.value).toBe("Hidden for your role");
    const cMgr = await resolveCitation(mgr, "lease:L-011", "en", "EGP");
    expect(cMgr!.rows.find((r) => r.label === "Monthly rent")!.value).toMatch(/EGP/);
  });
  it("gives the administrator nothing from the tools or the citations", async () => {
    expect((await runTool("portfolio_summary", {}, ctx(adm))).data).toEqual({ error: "forbidden" });
    expect(await resolveCitation(adm, "asset:A-001", "en", "EGP")).toBeNull();
  });
  it("never lets a draft update through to investors", async () => {
    const out = JSON.stringify((await runTool("recent_updates", { limit: 12 }, ctx(inv))).data);
    expect(out).not.toContain("Draft: year-end investor letter");
  });
});

/* ---------- live path with a fake Anthropic client ---------- */
type Resp = { stop_reason: string; content: unknown[] };
const use = (name: string, input: unknown, id = Math.random().toString(36).slice(2)) => ({ type: "tool_use", id, name, input });
function fake(script: Resp[]) {
  const calls: Record<string, unknown>[] = [];
  let i = 0;
  return { calls, client: { messages: { create: async (req: Record<string, unknown>) => { calls.push(JSON.parse(JSON.stringify(req))); const r = script[Math.min(i++, script.length - 1)]; return r; } } } as never };
}
const summaryThen = (blocks: unknown, extra: Record<string, unknown> = {}): Resp[] => [
  { stop_reason: "tool_use", content: [use("portfolio_summary", {}, "t1")] },
  { stop_reason: "tool_use", content: [use("submit_answer", { blocks, cannot_verify: false, ...extra }, "t2")] },
];

describe("live model path (fake client)", () => {
  beforeEach(() => { _resetRateLimit(); delete process.env.ANTHROPIC_MODEL; });

  it("runs tools, keeps only grounded blocks and records the request shape", async () => {
    const { client, calls } = fake(summaryThen([
      { text: "The portfolio holds 30 assets.", cites: ["calc:portfolio_summary"] },
      { text: "It is worth EGP 9bn.", cites: ["calc:portfolio_summary"] }, // invented number
      { text: "A-001 is large.", cites: ["asset:A-001"] }, // id not returned by a tool this turn
    ]));
    process.env.ANTHROPIC_MODEL = "claude-test-model";
    const a = await askHorus(mgr, "What is the portfolio worth?", "en", "EGP", { client, apiKey: "k", ip: "ip1" });
    expect(a.mode).toBe("live");
    expect(a.blocks.map((b) => b.text)).toEqual(["The portfolio holds 30 assets."]);
    expect(a.dropped).toBe(2);
    const first = calls[0] as { model: string; tools: { name: string }[]; tool_choice: unknown; temperature?: unknown };
    expect(first.model).toBe("claude-test-model"); // read from ANTHROPIC_MODEL
    expect(first.temperature).toBeUndefined();
    expect(first.tool_choice).toEqual({ type: "auto" });
    expect(first.tools.map((t) => t.name)).toContain("submit_answer");
    const second = calls[1] as { messages: { role: string; content: { type: string }[] }[] };
    const last = second.messages[second.messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content[0].type).toBe("tool_result"); // tool results go back to the model
  });
  it("treats a fully ungrounded answer as 'cannot verify'", async () => {
    const { client } = fake(summaryThen([{ text: "Prices will rise 13.7%.", cites: ["calc:portfolio_summary"] }]));
    const a = await askHorus(mgr, "Where are prices going?", "en", "EGP", { client, apiKey: "k", ip: "ip2" });
    expect(a.cannotVerify).toBe(true);
    expect(a.blocks).toHaveLength(0);
  });
  it("accepts a grounded draft from a manager and ignores one asked for by an investor", async () => {
    const draft = { title: "Update", body: "The portfolio holds 30 assets.", cites: ["calc:portfolio_summary"] };
    const mine = await askHorus(mgr, "Draft the update", "en", "EGP", { client: fake(summaryThen([{ text: "Draft ready.", cites: ["calc:portfolio_summary"] }], { draft })).client, apiKey: "k", ip: "ip3" });
    expect(mine.draft?.title).toBe("Update");
    const theirs = await askHorus(inv, "Draft the update", "en", "EGP", { client: fake(summaryThen([{ text: "Draft ready.", cites: ["calc:portfolio_summary"] }], { draft })).client, apiKey: "k", ip: "ip4" });
    expect(theirs.draft).toBeNull();
  });
  it("falls back to a scripted answer on refusal, with the notice", async () => {
    const a = await askHorus(mgr, "What is the total portfolio value?", "en", "EGP", { client: fake([{ stop_reason: "refusal", content: [] }]).client, apiKey: "k", ip: "ip5" });
    expect(a.mode).toBe("scripted");
    expect(a.notice).toBe("error");
    expect(a.blocks.length).toBeGreaterThan(0);
  });
  it("falls back when the model never submits an answer", async () => {
    const a = await askHorus(mgr, "What is the total portfolio value?", "en", "EGP", { client: fake([{ stop_reason: "end_turn", content: [{ type: "text", text: "It is a lot." }] }]).client, apiKey: "k", ip: "ip6" });
    expect(a.mode).toBe("scripted");
    expect(a.notice).toBe("error");
  });
  it("falls back when the client throws", async () => {
    const boom = { messages: { create: async () => { throw new Error("network"); } } } as never;
    const a = await askHorus(mgr, "Which assets are vacant?", "en", "EGP", { client: boom, apiKey: "k", ip: "ip7" });
    expect(a.mode).toBe("scripted");
  });
  it("uses scripted answers with a notice when no API key is set", async () => {
    const a = await askHorus(mgr, "What is the total portfolio value?", "en", "EGP", { apiKey: undefined, ip: "ip8" });
    expect(a).toMatchObject({ mode: "scripted", notice: "no_key" });
  });
  it("limits live questions to 20 per hour per user, then answers from the script", async () => {
    const ok = () => fake(summaryThen([{ text: "30 assets.", cites: ["calc:portfolio_summary"] }])).client;
    for (let i = 0; i < 20; i++) expect((await askHorus(mgr, "q", "en", "EGP", { client: ok(), apiKey: "k", ip: "rl" })).mode).toBe("live");
    const over = await askHorus(mgr, "What is the total portfolio value?", "en", "EGP", { client: ok(), apiKey: "k", ip: "rl" });
    expect(over).toMatchObject({ mode: "scripted", notice: "rate_limit" });
  });
  it("gives the administrator no answer", async () => {
    const a = await askHorus(adm, "What is the total portfolio value?", "en", "EGP", { apiKey: "k", ip: "adm" });
    expect(a.blocks).toHaveLength(0);
    expect(a.cannotVerify).toBe(true);
  });
  it("writes every question to the audit chain", async () => {
    const db = await getDb();
    const before = (await db.select().from(auditEvents)).filter((e) => e.action === "horus.ask").length;
    await askHorus(mgr, "Which assets are vacant?", "en", "EGP", { apiKey: undefined, ip: "aud" });
    const rows = (await db.select().from(auditEvents)).filter((e) => e.action === "horus.ask");
    expect(rows.length).toBe(before + 1);
    expect((rows[rows.length - 1].detail as { question: string }).question).toBe("Which assets are vacant?");
  });
});

describe("saving a draft", () => {
  it("stores an unpublished draft, routes it to approval and audits it; investors cannot", async () => {
    const db = await getDb();
    expect(await saveDraftUpdate(inv, { title: "x", body: "y", cites: [] }, "en")).toEqual({ ok: false, error: "forbidden" });
    const r = await saveDraftUpdate(mgr, { title: "Portfolio update", body: "Body text.", cites: ["calc:portfolio_summary"] }, "en");
    if (!r.ok) throw new Error("save");
    const [u] = await db.select().from(investorUpdates).where(eq(investorUpdates.id, r.id));
    expect(u.status).toBe("draft");
    const [ap] = await db.select().from(approvals).where(eq(approvals.refId, r.id));
    expect(ap).toMatchObject({ kind: "update_draft", routeRole: "manager", status: "pending", proposedBy: mgr.id });
    expect((await db.select().from(auditEvents)).some((e) => e.action === "update.draft" && e.entityId === r.id)).toBe(true);
  });
});
