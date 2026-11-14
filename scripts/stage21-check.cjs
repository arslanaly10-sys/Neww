const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-21";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(climate|nav|ntf|gov2)\.[A-Za-z_]+\b(?!\.[a-z]{2,4}\b)/;

/** Stage 21: climate and physical exposure. */
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
  const signIn = async (p, loc, name) => { await p.goto(`${BASE}/${loc}`); await p.getByRole("button", { name }).click(); await p.waitForURL(`**/${loc}/overview`); };
  const settle = async (p, ms = 1500) => { await p.waitForLoadState("load"); await p.waitForTimeout(ms); };
  const axe = async (p, name) => { await p.evaluate(axeSrc); const r = await p.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })); log(r.violations.length === 0, `axe: ${name} (${r.violations.map((v) => `${v.id}:${v.nodes.length} ${v.nodes.map((n) => n.target.join(" ")).join(" | ").slice(0, 200)}`).join(", ") || "0 violations"})`); };
  const noH = async (p, name) => { const [a, b] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); log(a <= b, `no horizontal scroll: ${name} (${a}/${b})`); };
  const leak = async (p, where) => { const t = await p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.parentElement || n.parentElement.closest(".num, pre, code, script, style, [hidden]")) continue; out.push(n.textContent); } return out.join(" "); }); const m = t.replace(/\S+@\S+/g, "").match(RAWKEY); log(!m, `no raw message keys: ${where}${m ? ` (${m[0]})` : ""}`); };

  // ================= Investor: portfolio exposure =================
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "Enter as Karim Fahmy");
  await p.goto(`${BASE}/en/portfolio`); await settle(p);
  await p.getByRole("link", { name: "Climate and physical exposure" }).click();
  await p.waitForURL("**/en/portfolio/climate"); await settle(p, 2500);
  log((await p.title()) === "Climate and physical exposure · ZMNHOOF OS", "the climate page has its own title");
  const bars = p.getByRole("list", { name: "Share of portfolio value by exposure" });
  log(await bars.locator("li").count() === 5, "five hazards with value shares");
  log(await bars.getByText(/^High \d+%, medium \d+%, low \d+% of value$/).first().isVisible(), "shares are written out, not only drawn");
  const mx = p.getByRole("table", { name: "Exposure by asset and hazard" });
  log(await mx.locator("tbody tr").count() === 30, "all 30 assets in the matrix");
  log(await p.getByText(/Future climate is not assessed yet/).isVisible(), "the missing projection is stated, not invented");
  await axe(p, "climate page");
  await leak(p, "climate page");
  await p.screenshot({ path: `${OUT}/en-climate.png`, fullPage: true });
  await p.goto(`${BASE}/en/asset/A-026/record#climate`); await settle(p, 1800);
  log(await p.getByRole("tab", { name: /Climate/ }).getAttribute("aria-selected") === "true", "the record opens on its climate tab");
  log(await p.getByText(/Hottest day in the climate record: \d+\.\d °C\./).first().isVisible(), "drivers cite the observed figures");
  log(!(await p.getByRole("button", { name: /^Record a site assessment/ }).count()), "investors cannot record assessments");
  await c.close();

  // ================= Analyst: records a site assessment =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "Enter as Laila Mansour");
  await p.goto(`${BASE}/en/asset/A-020/record#climate`); await settle(p, 1800);
  await p.getByRole("button", { name: "Record a site assessment: Flooding from heavy rain, A-020" }).click();
  const d = p.getByRole("dialog");
  await d.getByRole("radio", { name: "very high" }).check();
  await d.getByLabel("Method").selectOption("insurer_survey");
  await d.getByLabel("What it found").fill("Basement car park took water in the 2024 storm.");
  await d.getByRole("button", { name: "Save" }).click();
  await p.getByText(/CA-\d{3} saved\. Level now very high\./).waitFor({ timeout: 15000 });
  log(true, "an analyst records a site assessment");
  await p.reload(); await settle(p, 1500);
  log(await p.getByText(/Site assessment: Insurer's survey/).isVisible() && await p.getByText("The screening said medium.").first().isVisible(), "the assessment replaces the screen and shows what it replaced");
  await axe(p, "record climate tab");
  await p.screenshot({ path: `${OUT}/en-record-climate.png`, fullPage: true });
  await c.close();

  // ================= Manager is alerted =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "Enter as Nour Abdelrahman");
  await p.goto(`${BASE}/en/notifications`); await settle(p);
  log(await p.getByText("A-020: flooding from heavy rain exposure is now high").first().isVisible(), "managers are alerted to a high result");
  await c.close();

  // ================= Arabic phone =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await signIn(p, "ar", "الدخول بصفة كريم فهمي");
  await p.goto(`${BASE}/ar/portfolio/climate`); await settle(p, 2500);
  await noH(p, "ar climate @390");
  await axe(p, "ar climate phone");
  await leak(p, "ar climate phone");
  await p.screenshot({ path: `${OUT}/ar-climate-phone.png`, fullPage: true });
  await p.goto(`${BASE}/ar/asset/A-026/record#climate`); await settle(p, 2000);
  await noH(p, "ar record climate @390");
  await axe(p, "ar record climate phone");
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
