const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-3";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const RAWKEY = /\b(governance|overview|portfolio|asset|assetx|valuation|val|market|pf|al|scn|docs|horus|cite|gov2|packui|pack|clause|nav|roles|shell|login|sample|fig|status|types|finish|docKind|docStatus|cmd|cmd2|error|noAccess|common|units|admin|brand)\.[A-Za-z_]+(\.[A-Za-z_]+)*\b(?!\.[a-z]{2,4}\b)/;
const seenLeak = new Set();
/** A raw message key on screen (for example "governance.perm.x") means a translation did not resolve. */
async function leak(p) {
  // Visible text only; identifiers shown on purpose (audit action codes, hashes) sit in .num or pre elements and are skipped.
  const t = await p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.parentElement || n.parentElement.closest(".num, pre, code, script, style, [hidden]")) continue; out.push(n.textContent); } return out.join(" "); });
  const m = t.match(RAWKEY);
  const u = p.url();
  if (m && !seenLeak.has(u)) { seenLeak.add(u); log(false, `raw message key visible on ${u}: ${m[0]}`); }
}
const NAMES = { manager1: ["Nour Abdelrahman", "نور عبد الرحمن"], manager2: ["Omar Saleh", "عمر صالح"], investor: ["Karim Fahmy", "كريم فهمي"], admin: ["Salma Rashed", "سلمى راشد"] };



(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const errors = [];
  const open = async (viewport, scheme = "light", scale = 1) => {
    const c = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: scale });
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
  const settle = async (p) => { await p.waitForLoadState("load"); await p.waitForTimeout(1200); await leak(p); };
  const noH = async (p, name) => { const [a, b] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); log(a <= b, `no horizontal scroll: ${name} (${a}/${b})`); };

  // ================= Manager 1: run, adjust, propose =================
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "manager1");
  await p.goto(`${BASE}/en/valuation?asset=A-003`); await settle(p);
  log((await p.locator("#v-district").inputValue()) === "new-cairo" && (await p.locator("#v-type").inputValue()) === "villa", "valuation: asset A-003 prefills the form");
  await p.getByRole("button", { name: "Run valuation" }).click();
  await p.getByText("What drives the number").waitFor();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/en-valuation-result.png`, fullPage: true });
  log(await p.getByText("Model estimate").first().isVisible(), "valuation: estimate shown");
  log(await p.getByText("Value range").isVisible(), "valuation: range shown");
  log((await p.locator("table tbody tr").filter({ hasText: /S-\d{4}/ }).count()) === 5, "valuation: five comparable sales");
  log((await p.locator("ol > li").count()) === 6, "valuation: six driver rows");
  log(await p.getByText(/Confidence/).first().isVisible(), "valuation: confidence level shown");
  const estimate = Number((await p.locator("#v-final").inputValue()).replace(/,/g, ""));
  // adjust without reason -> blocked
  await p.locator("#v-final").fill(String(Math.round(estimate * 1.04 / 1000) * 1000));
  const sendBtn = p.getByRole("button", { name: "Propose for confirmation" });
  log(await sendBtn.isDisabled(), "adjustment without reason: send is disabled");
  await p.locator("#v-code").selectOption("recent_comparable");
  await p.locator("#v-reason").fill("short");
  log(await sendBtn.isDisabled(), "reason shorter than 10 characters: still disabled");
  await p.locator("#v-reason").fill("Neighbouring villa sold above the model range last month.");
  log(await sendBtn.isEnabled(), "code plus written reason: send enabled");
  // unchanged value needs no reason
  await p.locator("#v-final").fill(String(estimate));
  log((await p.locator("#v-code").count()) === 0 && await sendBtn.isEnabled(), "no adjustment: no reason required");
  await p.locator("#v-final").fill(String(Math.round(estimate * 1.04 / 1000) * 1000));
  await p.locator("#v-code").selectOption("recent_comparable");
  await p.locator("#v-reason").fill("Neighbouring villa sold above the model range last month.");
  await sendBtn.click();
  await p.getByText(/is waiting for review/).waitFor();
  const sentText = await p.getByText(/is waiting for review/).innerText();
  const vid = sentText.match(/V-\d{4}/)[0];
  log(true, `proposed ${vid}: ${sentText}`);
  await p.waitForTimeout(800);
  const card = p.locator("li", { hasText: vid }).first();
  log(await card.getByRole("button", { name: "Approve" }).isDisabled(), "own proposal: approve is disabled");
  log(await card.getByText(/you cannot confirm it/i).isVisible(), "own proposal: reason is shown on screen");
  await p.screenshot({ path: `${OUT}/en-queue-self-blocked.png`, fullPage: true });
  const beforeValue = await (async () => { await p.goto(`${BASE}/en/asset/A-003`); await settle(p); return (await p.locator("main").innerText()).match(/EGP [\d,]+/)[0]; })();
  await c.close();

  // ================= Manager 2: approves, portfolio updates =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "manager2");
  await p.goto(`${BASE}/en/valuation#queue`); await settle(p);
  const seededSelf = p.locator("li", { hasText: "V-0017" }).first();
  log(await seededSelf.getByRole("button", { name: "Approve" }).isDisabled(), "manager 2 cannot approve the valuation they proposed (V-0017)");
  const theirs = p.locator("li", { hasText: vid }).first();
  await theirs.getByRole("button", { name: "Approve" }).click();
  await p.getByText("Confirmed. The portfolio value has been updated.").waitFor();
  log(true, `manager 2 confirmed ${vid}`);
  await p.goto(`${BASE}/en/asset/A-003`); await settle(p);
  const afterValue = (await p.locator("main").innerText()).match(/EGP [\d,]+/)[0];
  log(afterValue !== beforeValue, `portfolio updated: A-003 ${beforeValue} -> ${afterValue}`);
  log(await p.getByText(vid).first().isVisible(), "asset valuation history lists the new valuation");
  // two-approver item
  await p.goto(`${BASE}/en/valuation#queue`); await settle(p);
  const big = p.locator("li", { hasText: "V-0016" }).first();
  log(await big.getByText("0 of 2 approvals").isVisible(), "large adjustment shows it needs two approvals");
  await big.getByRole("button", { name: "Approve" }).click();
  await p.getByText(/Approved\. 1 of 2 approvals so far/).waitFor();
  log(true, "first approval recorded, still in review");
  await p.waitForTimeout(600);
  log(await p.locator("li", { hasText: "V-0016" }).first().getByRole("button", { name: "Approve" }).isDisabled(), "same manager cannot approve twice");
  await c.close();

  // ================= Investor =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "investor");
  await p.goto(`${BASE}/en/valuation#queue`); await settle(p);
  log(await p.locator("li", { hasText: "V-0017" }).first().getByRole("button", { name: "Approve" }).isDisabled(), "investor cannot approve");
  log(await p.getByText("Only asset managers confirm valuations.").first().isVisible(), "investor sees why");
  await p.screenshot({ path: `${OUT}/en-queue-investor.png`, fullPage: true });
  await p.goto(`${BASE}/en/valuation`); await settle(p);
  await p.getByRole("button", { name: "Run valuation" }).click();
  await p.getByRole("button", { name: "Send for review" }).waitFor();
  log(true, "investor can run and send for review");

  // Horus as investor: lease rent hidden in the citation
  await p.getByRole("button", { name: "Ask Horus" }).first().click();
  await p.getByRole("dialog", { name: /Horus/ }).waitFor();
  await p.locator("#horus-q").fill("Tell me about A-001");
  await p.keyboard.press("Enter");
  await p.waitForSelector('article button[aria-label^="Lease"]', { timeout: 15000 });
  await p.locator('article button[aria-label^="Lease"]').first().click();
  await p.getByText("Hidden for your role").waitFor();
  log(true, "investor: lease citation hides rent");
  await p.screenshot({ path: `${OUT}/en-horus-investor-citation.png` });
  await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
  await c.close();

  // ================= Horus as manager (English) =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "manager1");
  await p.getByRole("button", { name: "Ask Horus" }).first().click();
  const dlg = p.getByRole("dialog", { name: /Horus/ });
  await dlg.waitFor();
  log(await dlg.getByText("AI informs, you decide").isVisible(), "Horus panel shows the brand line");
  log((await dlg.getByRole("button").filter({ hasText: /\?$|^Explain|^Draft/ }).count()) >= 12, "twelve suggested questions for a manager");
  await dlg.getByRole("button", { name: "What is the total portfolio value?" }).click();
  await dlg.getByText(/The portfolio holds 30 assets/).waitFor({ timeout: 15000 });
  log(await dlg.getByText("AI offline: scripted answer").isVisible(), "scripted-answer notice is visible when no key is set");
  const chip = dlg.locator('button[aria-label^="Calculation"]').first();
  log(await chip.isVisible(), "answer carries a citation chip");
  await chip.click();
  await p.getByText("Deterministic function").waitFor();
  await p.screenshot({ path: `${OUT}/en-horus-citation.png` });
  log(await p.getByText("Deterministic function").isVisible(), "chip opens the calculation behind the number");
  await p.keyboard.press("Escape");
  await dlg.locator("#horus-q").fill("Which leases end soon?"); await p.keyboard.press("Enter");
  await dlg.getByText(/leases end within 120 days/).waitFor({ timeout: 15000 });
  await dlg.locator('button[aria-label^="Lease"]').first().click();
  await p.getByText("Annual indexation").waitFor();
  log(true, "lease chip opens the exact lease row");
  await p.keyboard.press("Escape");
  await dlg.locator("#horus-q").fill("what is the meaning of life"); await p.keyboard.press("Enter");
  await dlg.getByText("I can't verify that from your portfolio data.").waitFor({ timeout: 15000 });
  log(true, "unanswerable question: 'I can't verify'");
  await dlg.locator("#horus-q").fill("Should I sell my Zamalek flat?"); await p.keyboard.press("Enter");
  await dlg.getByText(/does not give investment advice/).waitFor({ timeout: 15000 });
  log(true, "advice question is declined with 'AI informs, you decide'");
  await dlg.locator("#horus-q").fill("Draft the investor update"); await p.keyboard.press("Enter");
  await dlg.getByText("Draft investor update").waitFor({ timeout: 15000 });
  await dlg.getByRole("button", { name: "Save as draft" }).click();
  await dlg.getByText(/Saved as draft U-\d{3}/).waitFor();
  await p.screenshot({ path: `${OUT}/en-horus-draft.png` });
  log(true, "draft saved for approval");
  await p.keyboard.press("Escape");
  // explain valuation via panel, then command bar hand-off
  await p.keyboard.press("Control+k");
  await p.getByPlaceholder("Search assets, districts, documents and actions").fill("which assets are vacant right now");
  await p.getByText(/Ask Horus: which assets are vacant/).waitFor();
  await p.keyboard.press("Enter");
  await p.getByRole("dialog", { name: /Horus/ }).getByText(/assets are vacant/).first().waitFor({ timeout: 15000 });
  log(true, "command bar hands a typed question to Horus");
  await p.screenshot({ path: `${OUT}/en-command-to-horus.png` });
  await p.keyboard.press("Escape");
  // command bar: run a valuation action
  await p.keyboard.press("Control+k");
  await p.getByPlaceholder("Search assets, districts, documents and actions").fill("run a valuation");
  await p.getByRole("option", { name: /Run a valuation/ }).click();
  await p.waitForURL("**/en/valuation");
  log(true, "command bar action: run a valuation");
  await c.close();

  // ================= Arabic =================
  ({ c, p } = await open({ width: 1360, height: 900 }, "dark"));
  await signIn(p, "ar", "manager1");
  await p.goto(`${BASE}/ar/valuation?asset=A-001`); await settle(p);
  await p.getByRole("button", { name: "إجراء التقييم" }).click();
  await p.getByText("ما الذي يحرّك الرقم").waitFor();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/ar-valuation-result-dark.png`, fullPage: true });
  log((await p.getAttribute("html", "dir")) === "rtl", "AR valuation dir=rtl");
  await p.getByRole("button", { name: "اسأل حورس" }).first().click();
  const adlg = p.getByRole("dialog", { name: /حورس/ });
  await adlg.waitFor();
  await adlg.getByRole("button", { name: "كم تبلغ القيمة الإجمالية للمحفظة؟" }).click();
  await adlg.getByText(/تضم المحفظة 30 أصلاً/).waitFor({ timeout: 15000 });
  await p.waitForTimeout(400);
  log(await adlg.getByText("الذكاء الاصطناعي غير متصل: إجابة مبرمجة").isVisible(), "AR scripted notice");
  const side = await adlg.evaluate((el) => (el.getBoundingClientRect().left < window.innerWidth / 2 ? "left" : "right"));
  log(side === "left", `AR Horus panel opens on the reading-end (left) side (${side})`);
  await adlg.locator("#horus-q").fill("اشرح آخر تقييم"); await p.keyboard.press("Enter");
  await adlg.getByText(/التقييم V-/).first().waitFor({ timeout: 15000 });
  await p.screenshot({ path: `${OUT}/ar-horus-dark.png` });
  await adlg.locator('button[aria-label^="تقييم"]').first().click();
  await p.getByText("تقدير النموذج").first().waitFor();
  await p.screenshot({ path: `${OUT}/ar-horus-citation-dark.png` });
  log(true, "AR valuation explanation with citation chip dialog");
  await c.close();

  // ================= Admin =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "admin");
  log((await p.getByRole("button", { name: "Ask Horus" }).count()) === 0, "admin: no Horus button");
  await p.goto(`${BASE}/en/valuation`); await settle(p);
  log(await p.getByText("Not available to this role").isVisible(), "admin: valuation denied");
  const evText = await (async () => { await p.goto(`${BASE}/en/overview`); await settle(p); return p.locator("main").innerText(); })();
  log(/audit events\s*\n?\s*\d+/i.test(evText), "admin sees audit event count");
  await c.close();

  // ================= Phone =================
  for (const loc of ["en", "ar"]) {
    ({ c, p } = await open({ width: 390, height: 844 }, "light", 2));
    await signIn(p, loc, "manager1");
    await p.goto(`${BASE}/${loc}/valuation?asset=A-001`); await settle(p); await noH(p, `${loc} valuation form @390`);
    await p.getByRole("button", { name: loc === "en" ? "Run valuation" : "إجراء التقييم" }).click();
    await p.getByText(loc === "en" ? "What drives the number" : "ما الذي يحرّك الرقم").waitFor(); await p.waitForTimeout(600);
    await noH(p, `${loc} valuation result @390`);
    await p.screenshot({ path: `${OUT}/${loc}-valuation-phone.png`, fullPage: true });
    await p.goto(`${BASE}/${loc}/valuation#queue`); await settle(p); await noH(p, `${loc} review queue @390`);
    await p.getByRole("button", { name: loc === "en" ? "Ask Horus" : "اسأل حورس" }).first().click();
    const d = p.getByRole("dialog", { name: /Horus|حورس/ }); await d.waitFor();
    await d.getByRole("button", { name: loc === "en" ? "Which assets are vacant?" : "ما الأصول الشاغرة؟" }).click();
    await d.locator("article").getByText(loc === "en" ? /assets are vacant/ : /من الأصول الشاغرة/).first().waitFor({ timeout: 15000 });
    await p.waitForTimeout(500);
    await noH(p, `${loc} Horus panel @390`);
    await p.screenshot({ path: `${OUT}/${loc}-horus-phone.png` });
    await c.close();
  }

  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
