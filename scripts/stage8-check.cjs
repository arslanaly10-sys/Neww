const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-8";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(lease|nav|horus|gov2|governance)\.[A-Za-z_]+\b(?!\.[a-z]{2,4}\b)/;
const NAMES = { manager1: ["Nour Abdelrahman", "نور عبد الرحمن"], investor: ["Karim Fahmy", "كريم فهمي"] };

/** Stage 8: tenants and leases — rent collection, arrears, reminders, renewals, the tenant page, roles. */
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
  const settle = async (p, ms = 1200) => { await p.waitForLoadState("load"); await p.waitForTimeout(ms); };
  const axe = async (p, name) => { await p.evaluate(axeSrc); const r = await p.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })); log(r.violations.length === 0, `axe: ${name} (${r.violations.map((v) => v.id).join(", ") || "0 violations"})`); };
  const noH = async (p, name) => { const [a, b] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); log(a <= b, `no horizontal scroll: ${name} (${a}/${b})`); };
  const leak = async (p, where) => { const t = await p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.parentElement || n.parentElement.closest(".num, pre, code, script, style, [hidden]")) continue; out.push(n.textContent); } return out.join(" "); }); const m = t.match(RAWKEY); log(!m, `no raw message keys: ${where}${m ? ` (${m[0]})` : ""}`); };

  // ================= Manager, desktop =================
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "manager1");
  await p.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Leases" }).click();
  await p.waitForURL("**/en/leases"); await settle(p);
  log((await p.title()) === "Tenants and leases · ZMNHOOF OS", "Leases page has its own title");
  log(await p.getByRole("tab", { name: /Rent collection/ }).getAttribute("aria-selected") === "true", "manager lands on rent collection");
  const main = await p.locator("main").innerText();
  log(/Collected, Nov 2026/.test(main) && /Overdue rent/.test(main), "collection rate and overdue rent are shown");
  log(/Over 90 days|61 to 90 days|31 to 60 days/.test(main), "overdue rent is broken down by age");
  await axe(p, "rent collection");
  await p.screenshot({ path: `${OUT}/en-rent.png`, fullPage: true });

  // Record a part payment on the most overdue invoice
  const first = p.locator("ul[aria-labelledby=open-h] > li").first();
  const tenantName = (await first.locator("p").first().innerText()).trim();
  await first.getByRole("button", { name: "Record payment" }).click();
  const pay = p.getByRole("dialog", { name: /Payment for/ });
  const amt = pay.getByLabel("Amount received (EGP)");
  const owed = Number(await amt.inputValue());
  await amt.fill(String(owed + 1));
  await pay.getByRole("button", { name: "Record payment" }).click();
  await p.waitForTimeout(400);
  log(await amt.evaluate((el) => el.validity.rangeOverflow) && await pay.isVisible(), "overpaying an invoice is refused before it is sent (the server refuses it too)");
  await amt.fill(String(Math.floor(owed / 2)));
  await pay.getByRole("button", { name: "Record payment" }).click();
  await p.getByText(/Part payment recorded; EGP [\d,]+ still owed\. Audit event #\d+\./).waitFor();
  log(true, `part payment recorded for ${tenantName}`);

  // Reminder, then a second one is refused
  await p.reload(); await settle(p);
  const overdueRow = p.locator("ul[aria-labelledby=open-h] > li").filter({ has: p.getByRole("button", { name: "Send reminder" }) }).filter({ hasNotText: "Last reminder" }).first();
  const rowText = (await overdueRow.locator("p").first().innerText()).trim();
  await overdueRow.getByRole("button", { name: "Send reminder" }).click();
  await p.getByText(/Reminder placed in the outbox as M-[0-9a-f]+ \(audit event #\d+\)\./).waitFor();
  log(true, `reminder sent to ${rowText}`);
  await p.reload(); await settle(p);
  const again = p.locator("ul[aria-labelledby=open-h] > li").filter({ hasText: "Last reminder 2026-11-12" }).first();
  await again.getByRole("button", { name: "Send reminder" }).click();
  await again.getByText("A reminder went out less than a week ago.").waitFor();
  log(true, "a second reminder within a week is refused");

  // Renewals
  await p.getByRole("tab", { name: /Renewals/ }).click();
  log(p.url().endsWith("#renewals"), "renewals tab has its own address");
  const notStarted = p.locator("section[aria-labelledby=st-not_started] ul > li").first();
  const leaseId = (await notStarted.locator(".num").first().innerText()).trim();
  await notStarted.getByRole("button", { name: "Update renewal" }).click();
  const ren = p.getByRole("dialog", { name: new RegExp(`Renewal of ${leaseId}`) });
  await ren.getByLabel("Stage").selectOption("offered");
  await ren.getByRole("button", { name: "Save" }).click();
  await ren.getByText(/an offer or agreement needs a rent/).waitFor();
  log(await ren.getByLabel("Stage").inputValue() === "offered", "an offer without a proposed rent is refused, and the chosen stage is kept");
  await ren.getByLabel(/Proposed monthly rent/).fill("95000");
  await ren.getByRole("button", { name: "Save" }).click();
  await p.getByText(/Renewal updated\. Recorded as audit event #\d+\./).waitFor();
  const moved = await p.locator("section[aria-labelledby=st-offered]").getByText(leaseId, { exact: true }).waitFor({ timeout: 10000 }).then(() => true, () => false);
  log(moved, `${leaseId} moved to Offer sent`);
  await axe(p, "renewals");
  await p.screenshot({ path: `${OUT}/en-renewals.png`, fullPage: true });

  // Tenant page
  await p.getByRole("tab", { name: /Tenants/ }).click();
  const owing = p.locator("section[aria-labelledby=tn-h] li").filter({ hasText: /Owes EGP/ }).first();
  await owing.getByRole("link").first().click();
  await p.waitForURL(/\/en\/leases\/T-\d{3}$/); await settle(p);
  const tp = await p.locator("main").innerText();
  log(/Contact/.test(tp) && /\.example/.test(tp), "tenant page shows the contact");
  log(/Rent invoices/.test(tp) && /Received EGP [\d,]+ on/.test(tp), "tenant page lists invoices and payments");
  log(/^T-\d{3} · ZMNHOOF OS$/.test(await p.title()), "tenant tab title is its id");
  await axe(p, "tenant page");
  await leak(p, "tenant page");
  await p.screenshot({ path: `${OUT}/en-tenant.png`, fullPage: true });

  // Horus knows about rent
  await p.getByRole("button", { name: "Ask Horus" }).first().click();
  const h = p.getByRole("dialog", { name: /Horus/ });
  await h.locator("#horus-q").fill("Which tenants are behind on rent?"); await h.locator("#horus-q").press("Enter");
  await h.getByText(/of rent is collected/).waitFor({ timeout: 15000 });
  log(await h.getByText(/Owing the most:/).isVisible(), "Horus answers who owes rent, with lease citations");
  await c.close();

  // ================= Investor =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "investor");
  await p.goto(`${BASE}/en/leases`); await settle(p);
  log(await p.getByRole("tab", { name: /Rent collection/ }).count() === 0, "investor has no rent collection tab");
  const it = await p.locator("main").innerText();
  log(!/EGP|USD|Owes|Rent now/.test(it), "investor sees no rent amounts or arrears");
  log(/Offer sent|Negotiating|Agreed|Not started|Tenant leaving/.test(it), "investor sees renewal stages");
  await p.getByRole("tab", { name: /Tenants/ }).click();
  await p.locator("section[aria-labelledby=tn-h] a").first().click(); await settle(p);
  log(!/Contact|Rent invoices|EGP/.test(await p.locator("main").innerText()), "investor's tenant page has no contact, invoices or amounts");
  await c.close();

  // ================= Phone, Arabic =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await signIn(p, "ar", "manager1");
  const tabs = await p.locator("nav.fixed > a, nav.fixed > button").count();
  log(tabs === 5, `phone tab bar has five items with More (${tabs})`);
  await p.getByRole("button", { name: "المزيد" }).click();
  await p.getByRole("dialog", { name: "المزيد" }).getByRole("link", { name: "العقود" }).click();
  await p.waitForURL("**/ar/leases"); await settle(p);
  await noH(p, "ar leases @390");
  await leak(p, "ar leases");
  await p.screenshot({ path: `${OUT}/ar-leases-phone.png`, fullPage: true });
  await p.getByRole("button", { name: "المزيد" }).click();
  await p.getByRole("dialog", { name: "المزيد" }).getByRole("link", { name: "الحوكمة" }).click();
  await p.waitForURL("**/ar/governance");
  log(true, "More sheet reaches the remaining areas");
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
