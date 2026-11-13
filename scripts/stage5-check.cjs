const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-5";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
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

const RAWKEY = /\b(governance|overview|portfolio|asset|assetx|valuation|val|market|pf|al|scn|docs|horus|cite|gov2|packui|pack|clause|nav|roles|shell|login|sample|fig|status|types|finish|docKind|docStatus|cmd|cmd2|error|noAccess|common|units|admin|brand)\.[A-Za-z_]+(\.[A-Za-z_]+)*\b(?!\.[a-z]{2,4}\b)/;
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
  const settle = async (p, ms = 1500) => { await p.waitForLoadState("load"); await p.waitForTimeout(ms); await leak(p); };
  const noH = async (p, name) => { const [a, b] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); log(a <= b, `no horizontal scroll: ${name} (${a}/${b})`); };
  const bellCount = async (p) => Number((await p.locator('a[href$="/overview/alerts"][aria-label]').first().innerText()).replace(/\D/g, "") || 0);
  const firstEvent = (p) => p.evaluate(() => new Promise((res, rej) => { const es = new EventSource("/api/events"); const t = setTimeout(() => { es.close(); rej(new Error("no event")); }, 15000); es.addEventListener("activity", (e) => { clearTimeout(t); es.close(); res(JSON.parse(e.data)); }); }));

  // ================= Manager 1 =================
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "manager1");
  const n0 = await bellCount(p);
  log(n0 > 10, `header bell shows what needs attention (${n0})`);
  log(Number((await p.locator("aside nav a[href$=\"/overview\"] .num").first().innerText()).match(/\d+/)[0]) === n0, "nav badge on Overview matches the bell");
  log(await p.getByRole("heading", { name: "Needs attention" }).isVisible(), "overview shows the needs-attention card");
  await p.getByText("Simulated").first().waitFor();
  await p.locator('[aria-live="polite"] li').filter({ hasText: /Simulated/ }).first().waitFor({ timeout: 15000 });
  log(true, "overview live feed receives a simulated event");
  await p.screenshot({ path: `${OUT}/en-overview-manager.png`, fullPage: true });

  await p.goto(`${BASE}/en/overview/alerts`); await settle(p);
  log(await p.getByRole("heading", { name: "Alerts and approvals", level: 1 }).isVisible(), "alerts and approvals page loads");
  for (const k of ["Lease renewals", "Missing documents", "Valuation drift", "Vacancy cost"]) log((await p.getByRole("heading", { name: new RegExp(`^${k}`) }).count()) > 0, `alert group present: ${k}`);
  log(await p.getByText(/has been vacant for \d+ days, costing about EGP/).first().isVisible(), "vacancy cost alert states the cost");
  await p.screenshot({ path: `${OUT}/en-alerts-manager.png`, fullPage: true });

  // approvals and separation of duties
  const ap3 = p.locator("li", { hasText: "AP-003" }).first();
  log(await ap3.getByRole("button", { name: "Approve" }).isDisabled(), "own draft: approve disabled");
  log(await ap3.getByText("You proposed this, so you cannot decide it.").isVisible(), "own draft: the reason is on screen");
  log(await p.getByText("AP-004").count() === 0, "the admin-routed role change is not shown to a manager");
  const ap2 = p.locator("li", { hasText: "AP-002" }).first();
  log(await ap2.getByRole("button", { name: "Approve" }).isEnabled(), "a different manager's valuation can be approved");

  // snooze with mandatory reason
  const before = await bellCount(p);
  const vac = p.locator("li", { hasText: /has been vacant for/ }).first();
  await vac.getByRole("button", { name: "Snooze" }).click();
  const confirmBtn = p.getByRole("button", { name: "Snooze this alert" });
  log(await confirmBtn.isDisabled(), "snooze needs a reason");
  await p.getByLabel("Reason (at least 10 characters)").fill("short");
  log(await confirmBtn.isDisabled(), "a short reason is not enough");
  await p.getByLabel("Reason (at least 10 characters)").fill("Agent has two viewings booked this week.");
  await confirmBtn.click();
  await p.getByText(/Snoozed by Nour Abdelrahman: Agent has two viewings/).waitFor();
  log(true, "snoozed alert shows who snoozed it and why");
  await p.waitForTimeout(800);
  log((await bellCount(p)) === before - 1, `the bell count dropped by one (${before} -> ${await bellCount(p)})`);
  await p.getByRole("button", { name: "Reopen" }).first().click();
  await p.waitForTimeout(1500);
  log((await bellCount(p)) === before, "reopening restores the count");
  await c.close();

  // ================= Manager 2: approves the draft and the valuation =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "manager2");
  await p.goto(`${BASE}/en/overview/alerts`); await settle(p);
  const own = p.locator("li", { hasText: "AP-002" }).first();
  log(await own.getByRole("button", { name: "Approve" }).isDisabled() && await own.getByText("You proposed this").isVisible(), "manager 2 cannot approve their own valuation");
  const draft = p.locator("li", { hasText: "AP-003" }).first();
  await draft.getByRole("button", { name: "Approve" }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await draft.getByText(/AP-003 is approved\. Recorded as audit event #\d+/).waitFor();
  log(true, "manager 2 approved manager 1's draft");
  await p.goto(`${BASE}/en/portfolio`); await settle(p);
  log(await p.getByText("Draft: year-end investor letter").isVisible() && (await p.getByText("Draft", { exact: true }).count()) === 0, "the approved update is published (no Draft badge)");
  const manager2Event = await firstEvent(p);
  log(manager2Event.simulated === true && ["rent_receipt", "new_enquiry", "valuation_change"].includes(manager2Event.kind), `SSE event for a manager is simulated and financial-domain (${manager2Event.kind})`);
  log(typeof manager2Event.amountEgp === "number" || manager2Event.kind !== "rent_receipt", "manager sees the rent amount on a rent event");
  await c.close();

  // ================= Investor =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "investor");
  await p.goto(`${BASE}/en/overview/alerts`); await settle(p);
  const grp = (k) => p.getByRole("heading", { name: new RegExp(`^${k}`) }).count();
  log(await grp("Vacancy cost") === 0 && await grp("Valuation drift") === 0, "investor: no vacancy-cost or valuation-drift alerts");
  log(await grp("Lease renewals") > 0 && await grp("Missing documents") > 0, "investor: lease and document alerts only");
  log(await p.getByRole("button", { name: "Snooze" }).count() === 0, "investor: no snooze buttons");
  log(await p.getByText("Only asset managers can snooze alerts.").isVisible(), "investor: told why");
  await p.screenshot({ path: `${OUT}/en-alerts-investor.png`, fullPage: true });
  const invEvent = await firstEvent(p);
  log(invEvent.amountEgp === null, "SSE: an investor's rent event carries no amount");
  await c.close();

  // ================= Admin =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "admin");
  log(await p.getByText("Chain valid").first().isVisible(), "admin overview shows the chain is valid");
  log(await p.getByRole("heading", { name: "Needs attention" }).count() === 0, "admin overview has no financial alerts");
  const adminEvent = await firstEvent(p);
  log(adminEvent.kind === "system" && adminEvent.assetId === null, `SSE: admin only gets system events (${adminEvent.systemKey})`);
  await p.goto(`${BASE}/en/overview/alerts`); await settle(p);
  const ap4 = p.locator("li", { hasText: "AP-004" }).first();
  log(await ap4.getByRole("button", { name: "Approve" }).isEnabled(), "admin can decide the role-change request");
  log(await ap4.getByText(/No role actually changes/).isVisible(), "the demo nature of the role change is stated");
  await ap4.getByRole("button", { name: "Approve" }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await ap4.getByText(/AP-004 is approved\. Recorded as audit event #\d+/).waitFor();
  log(true, "role change decided and recorded");

  await p.goto(`${BASE}/en/governance`); await settle(p);
  log(await p.getByRole("heading", { name: "Audit log" }).isVisible() && (await p.locator("#audit ~ div ul li, section[aria-labelledby=audit] ul li").count()) > 5, "admin sees the audit log");
  await p.getByRole("button", { name: "Verify chain" }).click();
  await p.getByText(/Chain verified: \d+ events/).waitFor();
  log(true, "Verify chain passes on a clean chain");
  await p.screenshot({ path: `${OUT}/en-governance-verified.png`, fullPage: true });
  await p.getByRole("button", { name: "Tamper with an event (demo)" }).click();
  await p.getByText(/Event 7 was edited directly in the database/).waitFor();
  await p.waitForTimeout(800);
  await p.getByRole("button", { name: "Verify chain" }).click();
  await p.getByText(/Chain broken at event 7 \(position 6\)\. Expected .* but found/).waitFor();
  log(true, "Verify chain fails and names event 7, position 6, with expected and found");
  log(await p.getByText("Chain broken at event 7").first().isVisible(), "the status badge turns red");
  log(await p.getByText("The audit chain does not verify.").isVisible(), "the security posture reflects the broken chain");
  await p.screenshot({ path: `${OUT}/en-governance-broken.png`, fullPage: true });
  await p.goto(`${BASE}/en/overview`); await settle(p);
  log(await p.getByText("Chain broken at event 7").first().isVisible(), "admin overview also shows the break");
  await p.goto(`${BASE}/en/governance`); await settle(p);
  await p.getByRole("button", { name: "Restore the event (demo)" }).click();
  await p.getByText("The event was restored. Verify the chain again.").waitFor();
  await p.getByRole("button", { name: "Verify chain" }).click();
  await p.getByText(/Chain verified: \d+ events/).waitFor();
  log(true, "after restore the chain verifies again");
  // filtering
  await p.locator("#aa").selectOption("alert.snooze"); await p.getByRole("button", { name: "Apply" }).click();
  await p.waitForLoadState("load"); await p.waitForTimeout(800);
  log((await p.getByText("Alert snoozed").count()) >= 1, "the audit log can be filtered by action (the snooze is recorded)");
  await c.close();

  // ================= Manager sees governance without the log =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "manager1");
  await p.goto(`${BASE}/en/governance`); await settle(p);
  log(await p.getByText("The audit log is visible to the administrator only.").isVisible(), "manager: governance explains the log is admin-only");
  log(await p.getByRole("button", { name: "Verify chain" }).count() === 0, "manager: no verify button");
  await c.close();

  // ================= 404, headers, robots, og =================
  ({ c, p } = await open({ width: 1000, height: 700 }));
  await signIn(p, "en", "manager1");
  const nf = await p.goto(`${BASE}/en/nope`);
  log(nf.status() === 404 && await p.getByText("That page does not exist.").isVisible(), `unknown page is a calm 404 (${nf.status()})`);
  const home = await p.request.get(`${BASE}/en`);
  const h = home.headers();
  log(!!h["content-security-policy"] && !!h["strict-transport-security"] && /noindex/.test(h["x-robots-tag"] ?? ""), "security headers and noindex are sent");
  log(/Disallow: \//.test(await (await p.request.get(`${BASE}/robots.txt`)).text()), "robots.txt disallows everything");
  log((await p.request.get(`${BASE}/og.png`)).status() === 200, "social image is served");
  const anon = await (await browser.newContext()).request.get(`${BASE}/api/events`);
  log(anon.status() === 401, `signed-out SSE returns 401 (${anon.status()})`);
  await c.close();

  // ================= Arabic dark + phone =================
  ({ c, p } = await open({ width: 1360, height: 900 }, "dark"));
  await signIn(p, "ar", "manager1");
  await p.goto(`${BASE}/ar/overview/alerts`); await settle(p);
  log((await p.getAttribute("html", "dir")) === "rtl" && await p.getByRole("heading", { name: "التنبيهات والموافقات", level: 1 }).isVisible(), "AR alerts page");
  log(await p.getByText(/شاغر منذ \d+ يوماً، وتبلغ كلفته نحو/).first().isVisible(), "AR vacancy alert sentence");
  await p.screenshot({ path: `${OUT}/ar-alerts-dark.png`, fullPage: true });
  await c.close();
  ({ c, p } = await open({ width: 1360, height: 900 }, "dark"));
  await signIn(p, "ar", "admin");
  await p.goto(`${BASE}/ar/governance`); await settle(p);
  await p.getByRole("button", { name: "تحقق من السلسلة" }).click();
  await p.getByText(/تم التحقق من السلسلة/).waitFor();
  await p.getByRole("button", { name: "تعديل حدث (عرض تجريبي)" }).click();
  await p.getByText(/عُدّل الحدث 7/).waitFor(); await p.waitForTimeout(700);
  await p.getByRole("button", { name: "تحقق من السلسلة" }).click();
  await p.getByText(/انكسرت السلسلة عند الحدث 7/).waitFor();
  await p.screenshot({ path: `${OUT}/ar-governance-broken-dark.png`, fullPage: true });
  log(true, "AR tamper then verify names the broken event");
  await p.getByRole("button", { name: "استعادة الحدث (عرض تجريبي)" }).click();
  await p.getByText("استُعيد الحدث. تحقق من السلسلة مجدداً.").waitFor();
  await c.close();

  for (const loc of ["en", "ar"]) {
    ({ c, p } = await open({ width: 390, height: 844 }, "light", 2));
    await signIn(p, loc, "manager1");
    await p.goto(`${BASE}/${loc}/overview`); await settle(p); await noH(p, `${loc} overview with attention + feed @390`);
    await p.goto(`${BASE}/${loc}/overview/alerts`); await settle(p); await noH(p, `${loc} alerts @390`);
    await p.screenshot({ path: `${OUT}/${loc}-alerts-phone.png`, fullPage: true });
    await c.close();
    ({ c, p } = await open({ width: 390, height: 844 }, "light", 2));
    await signIn(p, loc, "admin");
    await p.goto(`${BASE}/${loc}/governance`); await settle(p); await noH(p, `${loc} governance audit log @390`);
    await p.screenshot({ path: `${OUT}/${loc}-governance-phone.png`, fullPage: true });
    await c.close();
  }

  // ================= Reset (last: it wipes every change made above) =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "admin");
  await p.goto(`${BASE}/en/governance`); await settle(p);
  const resetBtn = p.getByRole("button", { name: "Reset demo data" });
  log(await resetBtn.isDisabled(), "reset is disabled until RESET is typed");
  await p.getByLabel("Type RESET to confirm").fill("reset");
  log(await resetBtn.isDisabled(), "lowercase does not confirm");
  await p.getByLabel("Type RESET to confirm").fill("RESET");
  await resetBtn.click();
  await p.getByText("Demo data reset. The audit chain starts again.").waitFor();
  await p.waitForTimeout(1200);
  await p.goto(`${BASE}/en/governance`); await settle(p);
  log(/Showing 1 to \d+ of (1\d|2\d)\b/.test(await p.locator("main").innerText()), "after the reset the audit chain is short again");
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
