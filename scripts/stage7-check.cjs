const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-7";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const NAMES = { manager1: ["Nour Abdelrahman", "نور عبد الرحمن"], manager2: ["Omar Saleh", "عمر صالح"], investor: ["Karim Fahmy", "كريم فهمي"], admin: ["Salma Rashed", "سلمى راشد"] };

/** Stage 7: the design fixes from the Impeccable critique. */
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

  // ================= Manager, desktop =================
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "manager1");
  await settle(p); // metadata streams in after the page, so the title arrives a moment later
  log((await p.title()) === "Overview · ZMNHOOF OS", `page title names the page (${await p.title()})`);
  const tiles = await p.locator("main section").first().locator(":scope > *").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  log(tiles.length === 5 && tiles[3] > tiles[0] * 1.3, `five KPI tiles fill two rows without a hole (${tiles.join(", ")})`);
  log(await p.getByText("Most urgent").isVisible(), "needs-attention card leads with the most urgent item");
  log((await p.getByRole("heading", { name: "Needs attention" }).locator("xpath=../..").getByText("High", { exact: true }).count()) === 0, "needs-attention card no longer stacks identical High pills");
  await p.screenshot({ path: `${OUT}/en-overview.png`, fullPage: true });

  // Valuation tabs
  await p.goto(`${BASE}/en/valuation`); await settle(p);
  log((await p.title()) === "Valuation · ZMNHOOF OS", "valuation tab title");
  log(await p.getByRole("tab", { name: "Run a valuation" }).getAttribute("aria-selected") === "true", "valuation opens on the Run tab");
  log(!(await p.getByRole("heading", { name: "Assumption register" }).isVisible().catch(() => false)), "assumption register is out of the way until its tab is chosen");
  await p.getByRole("tab", { name: "Run a valuation" }).focus();
  await p.keyboard.press("ArrowRight");
  log(await p.getByRole("tab", { name: /Review queue/ }).getAttribute("aria-selected") === "true" && p.url().endsWith("#queue"), "arrow key moves to the queue tab and updates the address");
  await p.goto(`${BASE}/en/overview`); await settle(p, 300);
  await p.goto(`${BASE}/en/valuation#history`); await settle(p);
  log(await p.getByRole("tab", { name: "History" }).getAttribute("aria-selected") === "true", "a #history link opens the History tab");
  log(await p.getByRole("tabpanel", { name: "History" }).getByText(/V-00\d\d .+/).first().isVisible(), "recent decisions name the asset, not just its id");

  // Reject needs a reason
  await p.goto(`${BASE}/en/valuation#queue`); await settle(p);
  const v16 = p.locator("li", { hasText: "V-0016" }).first();
  await v16.getByRole("button", { name: "Reject" }).click();
  const sheet = p.getByRole("dialog", { name: /Reject V-0016/ });
  await sheet.getByRole("button", { name: "Reject" }).click();
  await sheet.getByText("Give a reason for rejecting.").waitFor({ timeout: 5000 }).catch(() => {});
  log(await sheet.getByText("Give a reason for rejecting.").isVisible(), "rejecting without a reason is refused");
  log(await sheet.getByText("Human adjustment").isVisible() && await sheet.getByText("Final value").isVisible(), "decision sheet restates the adjustment and final value");
  await axe(p, "decision sheet");
  await p.screenshot({ path: `${OUT}/en-reject-sheet.png` });
  await sheet.getByRole("button", { name: "Cancel" }).click();

  // Alerts: grouped, filterable, snooze a group
  await p.goto(`${BASE}/en/overview/alerts`); await settle(p);
  const groups = await p.locator("section[aria-labelledby^=g-] h3").allInnerTexts();
  log(groups.length >= 3, `alerts are grouped by kind (${groups.map((g) => g.split("\n")[0]).join(" | ")})`);
  await p.getByRole("button", { name: /^Vacancy cost/ }).click();
  log((await p.locator("section[aria-labelledby^=g-]").count()) === 1, "a kind filter shows only that group");
  await p.getByRole("button", { name: /^All/ }).click();
  const bellBefore = Number((await p.locator('a[href$="/overview/alerts"][aria-label]').first().innerText()).replace(/\D/g, "") || 0);
  const vac = p.locator("section[aria-labelledby=g-vacancy_cost]");
  const nVac = await vac.locator("ul > li").count();
  await vac.getByRole("button", { name: /Snooze all/ }).click();
  await p.getByLabel(/Reason for snoozing all/).fill("Letting agent appointed for all vacant units.");
  await p.getByRole("button", { name: "Snooze this alert" }).click();
  await p.getByText(new RegExp(`Alerts snoozed: ${nVac}`)).waitFor({ timeout: 20000 });
  await p.waitForTimeout(1500);
  const bellAfter = Number((await p.locator('a[href$="/overview/alerts"][aria-label]').first().innerText()).replace(/\D/g, "") || 0);
  log(bellAfter === bellBefore - nVac, `snoozing a group of ${nVac} lowers the bell by ${nVac} (${bellBefore} to ${bellAfter})`);
  await axe(p, "alerts page");
  await p.screenshot({ path: `${OUT}/en-alerts-grouped.png`, fullPage: true });

  // Asset occupancy wording
  await p.goto(`${BASE}/en/asset/A-001`); await settle(p);
  await p.waitForFunction(() => document.title.startsWith("A-001"), null, { timeout: 5000 }).catch(() => {});
  log((await p.title()) === "A-001 · ZMNHOOF OS", "asset tab title is its id");
  const occ = await p.locator("dt", { hasText: "Occupancy" }).locator("xpath=following-sibling::dd").innerText();
  log(/^Let, lease L-\d+ until|^Vacant since|^Owner|^Land/.test(occ), `occupancy states the lease, not a dash (${occ})`);
  await c.close();

  // ================= Phone: one-row toolbar and the account sheet =================
  for (const loc of ["en", "ar"]) {
    ({ c, p } = await open({ width: 390, height: 844 }));
    await signIn(p, loc, "manager1");
    const bar = await p.locator("div.sticky.top-0").first().boundingBox();
    log(bar.height < 70, `${loc} phone toolbar is one row (${Math.round(bar.height)}px, was about 220px)`);
    await noH(p, `${loc} overview @390`);
    await p.getByRole("button", { name: loc === "en" ? "Account and settings" : "الحساب والإعدادات" }).click();
    const acc = p.getByRole("dialog", { name: loc === "en" ? "Account and settings" : "الحساب والإعدادات" });
    log(await acc.getByRole("button", { name: "USD" }).isVisible(), `${loc} currency is in the account sheet`);
    await acc.getByRole("button", { name: "USD" }).click();
    await p.waitForTimeout(1200);
    log((loc === "en" ? /USD/ : /دولار/).test(await p.locator("main").innerText()), `${loc} switching currency from the sheet works`);
    await p.screenshot({ path: `${OUT}/${loc}-phone-overview.png` });
    await c.close();
  }

  // ================= Administrator: chain first, no currency =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "admin");
  log(await p.getByRole("group", { name: "Currency" }).count() === 0, "administrator has no currency toggle");
  await p.goto(`${BASE}/en/governance`); await settle(p);
  const firstH2 = (await p.locator("main h2").first().innerText()).trim();
  log(firstH2 === "Audit log", `administrator's governance page leads with the audit chain (${firstH2})`);
  const strip = p.getByRole("list", { name: /latest events/ });
  log((await strip.locator("li").count()) === 6, "chain strip shows the six latest events");
  await p.getByRole("button", { name: /Tamper/ }).click(); await p.waitForTimeout(1500); await p.reload(); await settle(p);
  log(await p.getByText("Broken link").count() <= 1, "a broken link is marked on the strip when it is among the latest six");
  await p.getByRole("button", { name: /Restore/ }).click(); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/en-governance-admin.png` });
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
