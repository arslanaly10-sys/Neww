const fs = require("fs");
const path = require("path");
const os = require("os");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-6";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(horus|cite|pub|outbox|governance|al)\.[A-Za-z_]+(\.[A-Za-z_]+)*\b(?!\.[a-z]{2,4}\b)/;
const NAMES = { manager1: ["Nour Abdelrahman", "نور عبد الرحمن"], investor: ["Karim Fahmy", "كريم فهمي"], admin: ["Salma Rashed", "سلمى راشد"] };

/** Stage 6: Horus chat history, streaming steps, actions to confirm, attached files, help mode, the floating bubble,
 *  the public chatbot with demo requests, and the outbox on Governance. */
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const errors = [];
  const open = async (viewport, scheme = "light") => {
    const c = await browser.newContext({ viewport, colorScheme: scheme });
    const p = await c.newPage();
    p.on("console", (m) => { if (m.type() === "error") errors.push(`${p.url()} ${m.text()}`); });
    p.on("pageerror", (e) => errors.push(`${p.url()} pageerror ${e.message}`));
    return { c, p };
  };
  const signIn = async (p, loc, who) => {
    await p.goto(`${BASE}/${loc}`);
    await p.getByRole("button", { name: loc === "en" ? `Enter as ${NAMES[who][0]}` : `الدخول بصفة ${NAMES[who][1]}` }).click();
    await p.waitForURL(`**/${loc}/overview`);
  };
  // Visible text only; identifiers shown on purpose (audit action codes, hashes) sit in .num or pre elements and are skipped.
  const leak = async (p, where) => { const t = await p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.parentElement || n.parentElement.closest(".num, pre, code, script, style, [hidden]")) continue; out.push(n.textContent); } return out.join(" "); }); const m = t.match(RAWKEY); log(!m, `no raw message keys: ${where}${m ? ` (${m[0]})` : ""}`); };
  const noH = async (p, name) => { const [a, b] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); log(a <= b, `no horizontal scroll: ${name} (${a}/${b})`); };
  const axe = async (p, name) => { await p.evaluate(axeSrc); const r = await p.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })); log(r.violations.length === 0, `axe: ${name} (${r.violations.map((v) => v.id).join(", ") || "0 violations"})`); };

  // ================= Public chatbot (signed out) =================
  for (const loc of ["en", "ar"]) {
    const { c, p } = await open(loc === "en" ? { width: 1360, height: 900 } : { width: 390, height: 844 });
    await p.goto(`${BASE}/${loc}`);
    await p.waitForTimeout(2500); // the sign-in hero finishes its entrance before contrast is measured
    await p.getByRole("button", { name: loc === "en" ? "Questions? Ask us" : "لديك سؤال؟ اسألنا" }).click();
    const d = p.getByRole("dialog", { name: loc === "en" ? "Ask about ZMNHOOF OS" : "اسأل عن ZMNHOOF OS" });
    await d.waitFor();
    await d.getByRole("button", { name: loc === "en" ? "What is ZMNHOOF OS?" : "ما هو ZMNHOOF OS؟" }).click();
    await d.locator("article").getByText(loc === "en" ? /real estate portfolio system/ : /نظام لإدارة محافظ العقارات/).waitFor({ timeout: 15000 });
    log(true, `${loc} public chatbot answers from the product guide`);
    await d.getByLabel(loc === "en" ? "Ask a question" : "اكتب سؤالك").fill(loc === "en" ? "What is the portfolio worth?" : "كم قيمة المحفظة؟");
    await d.getByRole("button", { name: loc === "en" ? "Send" : "إرسال" }).click();
    await p.waitForTimeout(800);
    const txt = await d.innerText();
    log(!/EGP|جنيه/.test(txt), `${loc} public chatbot never shows portfolio figures`);
    await d.getByText(loc === "en" ? /Our guide does not cover that/ : /دليلنا لا يغطي ذلك/).waitFor({ timeout: 10000 });
    log(true, `${loc} public chatbot says when a question is outside its guide`);
    if (loc === "ar") await noH(p, "ar public chat @390");
    await axe(p, `${loc} public chat open`);
    await p.screenshot({ path: `${OUT}/${loc}-public-chat.png` });
    await d.getByRole("button", { name: loc === "en" ? "Request a demo" : "اطلب عرضًا" }).click();
    await d.getByRole("button", { name: loc === "en" ? "Send request" : "إرسال الطلب" }).click();
    await d.getByText(loc === "en" ? "Enter your name." : "أدخل اسمك.").waitFor({ timeout: 10000 });
    log(true, `${loc} demo request shows field errors`);
    await d.getByLabel(loc === "en" ? "Name" : "الاسم", { exact: false }).first().fill(loc === "en" ? "Mona Fathy" : "منى فتحي");
    await d.getByLabel(loc === "en" ? "Email" : "البريد الإلكتروني").fill(`mona.${loc}@example.com`);
    await d.getByLabel(loc === "en" ? "Company (optional)" : "الشركة (اختياري)").fill("Fathy Holdings");
    await d.getByRole("button", { name: loc === "en" ? "Send request" : "إرسال الطلب" }).click();
    await d.getByText(loc === "en" ? "Thank you. Your request is in." : "شكرًا لك. وصل طلبك.").waitFor();
    log(true, `${loc} demo request is accepted`);
    await p.screenshot({ path: `${OUT}/${loc}-public-demo-sent.png` });
    await leak(p, `${loc} sign-in with chat`);
    await c.close();
  }

  // ================= Manager: Horus =================
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "manager1");
  await p.getByRole("button", { name: "Ask Horus" }).last().click(); // the floating bubble
  let d = p.getByRole("dialog", { name: /Horus/ });
  await d.waitFor();
  log(await d.getByRole("radio", { name: "Portfolio" }).getAttribute("aria-checked") === "true", "Horus opens in Portfolio mode");

  // Streaming: the answer arrives after progress steps, through the NDJSON endpoint.
  const resp = p.waitForResponse((r) => r.url().endsWith("/api/horus"));
  await d.getByRole("button", { name: "What is the total portfolio value?" }).click();
  const r = await resp;
  log(/ndjson/.test(r.headers()["content-type"] ?? ""), "answers stream as newline-delimited JSON");
  await d.getByText(/The portfolio holds 30 assets/).waitFor({ timeout: 15000 });
  log(true, "portfolio answer shown");

  // Follow-up in the same conversation, then an action to confirm.
  await d.locator("#horus-q").fill("Snooze the most urgent alert"); await d.locator("#horus-q").press("Enter");
  await d.getByText("Ready for you to confirm").first().waitFor({ timeout: 15000 });
  const bellBefore = Number((await p.locator('a[href$="/overview/alerts"][aria-label]').first().innerText()).replace(/\D/g, "") || 0);
  await p.screenshot({ path: `${OUT}/en-horus-action.png` });
  await d.getByRole("button", { name: "Confirm" }).click();
  await d.getByText("Snoozed. It is recorded in the audit chain.").waitFor();
  log(true, "confirming the snooze works");
  await p.waitForTimeout(1500);
  const bellAfter = Number((await p.locator('a[href$="/overview/alerts"][aria-label]').first().innerText()).replace(/\D/g, "") || 0);
  log(bellAfter === bellBefore - 1, `bell count drops after the snooze (${bellBefore} to ${bellAfter})`);

  // Email draft goes to the outbox.
  await d.locator("#horus-q").fill("Draft an email to the investor"); await d.locator("#horus-q").press("Enter");
  await d.getByRole("button", { name: "Send to outbox" }).waitFor({ timeout: 15000 });
  await d.getByRole("button", { name: "Send to outbox" }).click();
  await d.getByText(/Placed in the outbox as M-/).waitFor();
  log(true, "drafted email is placed in the outbox");

  // History: the conversation is saved and can be reopened.
  await d.getByRole("button", { name: "Saved conversations" }).click();
  await d.getByRole("button", { name: /What is the total portfolio value\?/ }).first().waitFor();
  log(true, "conversation appears in saved conversations");
  await p.screenshot({ path: `${OUT}/en-horus-history.png` });
  await d.getByRole("button", { name: /What is the total portfolio value\?/ }).first().click();
  await d.getByText("Placed in the outbox", { exact: false }).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  await d.getByText("Draft an email to the investor").waitFor({ timeout: 10000 });
  log(await d.locator("article").count() === 3, `reopened conversation shows its three turns (${await d.locator("article").count()})`);

  // Attach a file and ask about it.
  await d.getByRole("button", { name: "New conversation" }).click();
  const tmp = path.join(os.tmpdir(), "zos-stage6-lease.txt");
  fs.writeFileSync(tmp, "Lease agreement between Sample Landlord and Nile Tenant.\nThe term starts 2026-01-01. Monthly rent EGP 85,000, paid quarterly.\n");
  await d.locator('input[type="file"]').setInputFiles(tmp);
  await d.getByText(/zos-stage6-lease\.txt is attached/).waitFor({ timeout: 15000 });
  await d.locator("#horus-q").fill("Summarise this file"); await d.locator("#horus-q").press("Enter");
  await d.getByText(/has 1 pages/).waitFor({ timeout: 15000 });
  await d.getByText(/Amounts found: EGP 85,000\./).waitFor({ timeout: 10000 });
  log(true, "Horus reads the attached file and quotes it");
  await p.screenshot({ path: `${OUT}/en-horus-file.png` });

  // Help mode.
  await d.getByRole("radio", { name: "Help" }).click();
  await d.getByRole("button", { name: "How do I approve a valuation?" }).click();
  await d.getByText(/A different manager approves it/).waitFor({ timeout: 15000 });
  log(await d.getByRole("link", { name: "Running and approving a valuation" }).isVisible(), "help answer links to its article");
  await axe(p, "Horus panel, help mode");
  await p.screenshot({ path: `${OUT}/en-horus-help.png` });
  await leak(p, "Horus panel");

  // Start a valuation from Horus.
  await d.getByRole("radio", { name: "Portfolio" }).click();
  await d.locator("#horus-q").fill("Start a valuation for A-003"); await d.locator("#horus-q").press("Enter");
  await d.getByRole("button", { name: "Open the valuation" }).click();
  await p.waitForURL("**/valuation?asset=A-003");
  log(true, "start-a-valuation action opens the pre-filled valuation");
  await c.close();

  // ================= Phone, Arabic: bubble and toolbar =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await signIn(p, "ar", "manager1");
  const bar = await p.locator("div.sticky.top-0").first().boundingBox();
  log(bar && bar.height < 200, `phone toolbar is shorter without the Horus button (${Math.round(bar?.height ?? 0)}px, was about 220px)`);
  await p.getByRole("button", { name: "اسأل حورس" }).click();
  d = p.getByRole("dialog", { name: /حورس/ });
  await d.waitFor();
  await d.getByRole("button", { name: "كم تبلغ القيمة الإجمالية للمحفظة؟" }).click();
  await d.getByText(/30 أصلًا|30 أصل/).first().waitFor({ timeout: 15000 });
  log(true, "ar Horus answers on a phone");
  await p.waitForTimeout(800);
  await noH(p, "ar Horus @390");
  await p.screenshot({ path: `${OUT}/ar-horus-phone.png` });
  await leak(p, "ar Horus phone");
  await c.close();

  // ================= Administrator: help only, outbox =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "admin");
  log(await p.getByRole("button", { name: "Ask Horus" }).count() === 0, "administrator has no portfolio Horus button");
  await p.getByRole("button", { name: "Help" }).click();
  d = p.getByRole("dialog", { name: /Horus/ });
  await d.waitFor();
  log(await d.getByRole("radio").count() === 0, "administrator's panel is help only");
  await d.getByRole("button", { name: "What can each role see?" }).click();
  await d.getByText(/There are three roles/).waitFor({ timeout: 15000 });
  log(true, "administrator gets help answers");
  await p.keyboard.press("Escape");
  await p.goto(`${BASE}/en/governance`);
  const gov = await p.locator("main").innerText();
  log(/Demo requests \(\d+\)/.test(gov) && gov.includes("Mona Fathy"), "demo requests are listed on Governance");
  log(gov.includes("New demo request: Mona Fathy") && gov.includes("Portfolio update"), "outbox lists lead and Horus emails");
  await p.locator("#outbox").scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/en-governance-outbox.png` });
  await leak(p, "governance outbox");
  await c.close();

  // ================= Investor: no outbox, no email drafting =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "investor");
  await p.goto(`${BASE}/en/governance`);
  log(!(await p.locator("main").innerText()).includes("Demo requests"), "investor does not see demo requests");
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
