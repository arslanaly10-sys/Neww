const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-18";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(md|nav|record)\.[A-Za-z_]+\b(?!\.[a-z]{2,4}\b)/;

/** Stage 18: data sources and market intelligence, with provenance and freshness. */
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
  const axe = async (p, name) => { await p.evaluate(axeSrc); const r = await p.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })); log(r.violations.length === 0, `axe: ${name} (${r.violations.map((v) => `${v.id}:${v.nodes.length}`).join(", ") || "0 violations"})`); };
  const noH = async (p, name) => { const [a, b] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); log(a <= b, `no horizontal scroll: ${name} (${a}/${b})`); };
  const leak = async (p, where) => { const t = await p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.parentElement || n.parentElement.closest(".num, pre, code, script, style, [hidden]")) continue; out.push(n.textContent); } return out.join(" "); }); const m = t.replace(/\S+@\S+/g, "").match(RAWKEY); log(!m, `no raw message keys: ${where}${m ? ` (${m[0]})` : ""}`); };

  // ================= Manager: market intelligence =================
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "Enter as Nour Abdelrahman");
  await p.goto(`${BASE}/en/market`); await settle(p);
  await p.getByRole("link", { name: "Market intelligence" }).first().click();
  await p.waitForURL("**/en/market/intelligence"); await settle(p, 2200);
  log((await p.title()) === "Market intelligence · ZMNHOOF OS", "market intelligence has its own title");
  for (const h of ["Official economic context", "Location context", "Earth observation", "Permissioned property data"]) log(await p.getByRole("heading", { name: h, level: 2 }).isVisible(), `layer shown: ${h}`);
  log(await p.getByRole("list", { name: "Official economic context" }).getByText("Population").first().isVisible(), "World Bank indicators are listed");
  await p.getByRole("list", { name: "Official economic context" }).getByText("Where this comes from").first().click();
  log(await p.getByText(/As published by the World Bank/).first().isVisible(), "each indicator shows how it was processed");
  log(await p.getByText(/No public API. Waiting for an administrator/).first().isVisible(), "file sources say they are waiting for a file");
  log(await p.getByRole("table", { name: "Location context by asset" }).locator("tbody tr").count() === 30, "location context for all 30 assets");
  log(await p.getByText(/straight lines from the asset's recorded point, not travel times/).isVisible(), "distances are labelled as straight lines");
  await axe(p, "market intelligence");
  await leak(p, "market intelligence");
  await p.screenshot({ path: `${OUT}/en-intelligence.png`, fullPage: true });
  await p.goto(`${BASE}/en/asset/A-001/record#location`); await settle(p);
  log(await p.getByText("People within 1 km").isVisible(), "the asset record has a location tab");
  await axe(p, "record location tab");
  await c.close();

  // ================= Administrator: data sources =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "Enter as Salma Rashed");
  await p.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Data sources" }).click();
  await p.waitForURL("**/en/sources"); await settle(p);
  log((await p.title()) === "Data sources · ZMNHOOF OS", "data sources has its own title");
  log(await p.getByText("CC BY 4.0").first().isVisible() && await p.getByText("Partnership needed").first().isVisible(), "licences and access are shown");
  await p.getByRole("button", { name: "Enter a published file for CAPMAS consumer price index" }).click();
  await p.getByLabel("Publication date").fill("2026-10-10");
  await p.getByLabel(/Figures, one per line/).fill("2026-08,281.4\n2026-09,284.3");
  await p.getByRole("button", { name: "Import figures" }).click();
  await p.getByText("2 rows imported.").waitFor();
  log(true, "the administrator enters a published CAPMAS file");
  await axe(p, "data sources");
  await leak(p, "data sources");
  await p.screenshot({ path: `${OUT}/en-sources.png`, fullPage: true });
  await c.close();

  // The CPI file now shows on market intelligence.
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "Enter as Laila Mansour");
  await p.goto(`${BASE}/en/market/intelligence`); await settle(p);
  log(await p.getByText("Urban consumer price index").isVisible(), "an imported file appears in the official layer");
  await c.close();

  // ================= Arabic phone =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await signIn(p, "ar", "الدخول بصفة كريم فهمي");
  await p.goto(`${BASE}/ar/market/intelligence`); await settle(p, 2000);
  await noH(p, "ar intelligence @390");
  await axe(p, "ar intelligence phone");
  await leak(p, "ar intelligence phone");
  await p.screenshot({ path: `${OUT}/ar-intelligence-phone.png`, fullPage: true });
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
