const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-2";
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


const GL = ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"];

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: GL });
  const errors = [];
  const open = async (viewport, scheme = "light", scale = 1) => {
    const c = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: scale });
    const p = await c.newPage();
    p.on("console", (m) => { if (m.type() === "error") errors.push(`${p.url()} ${m.text()}`); });
    p.on("pageerror", (e) => errors.push(`${p.url()} pageerror ${e.message}`));
    return { c, p };
  };
  const signIn = async (p, loc, who) => {
    const names = { manager: ["Nour Abdelrahman", "نور عبد الرحمن"], investor: ["Karim Fahmy", "كريم فهمي"] };
    await p.goto(`${BASE}/${loc}`);
    await p.getByRole("button", { name: loc === "en" ? `Enter as ${names[who][0]}` : `الدخول بصفة ${names[who][1]}` }).click();
    await p.waitForURL(`**/${loc}/overview`);
  };
  const settle = async (p) => { await p.waitForLoadState("load"); await p.waitForTimeout(1500); await leak(p); };
  const noH = async (p, name) => { const [a, b] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); log(a <= b, `no horizontal scroll: ${name} (${a}/${b})`); };

  // ---- Manager, desktop, English
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "manager");
  await p.goto(`${BASE}/en/portfolio`); await settle(p);
  log(await p.getByRole("heading", { name: "Portfolio", level: 1 }).isVisible(), "portfolio loads");
  await p.screenshot({ path: `${OUT}/en-portfolio-desktop.png`, fullPage: true });
  const yieldTxt = await p.getByRole("button", { name: /Net yield, last 12 months:/ }).innerText();
  log(/\d+\.\d%/.test(yieldTxt), `net yield shown (${yieldTxt})`);

  // chart scrubbing: mouse
  const chart = p.getByRole("group", { name: /Portfolio value\./ });
  const readout = () => p.locator('[aria-live="polite"]').first().innerText();
  await chart.scrollIntoViewIfNeeded();
  const before = await readout();
  const box = await chart.boundingBox();
  await p.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await p.waitForTimeout(300);
  const mid = await readout();
  log(before !== mid, "chart readout changes when scrubbing with the mouse");
  await p.mouse.move(box.x + box.width * 0.2 + 1, box.y + box.height / 2); await p.screenshot({ path: `${OUT}/en-chart-scrub.png`, clip: { x: box.x - 20, y: box.y - 120, width: box.width + 40, height: box.height + 200 } });
  await p.mouse.move(5, 5);
  await p.waitForTimeout(200);
  // keyboard
  await chart.focus();
  const k0 = await readout();
  await p.keyboard.press("ArrowLeft"); await p.keyboard.press("ArrowLeft");
  const k1 = await readout();
  log(k0 !== k1, "chart readout changes with arrow keys");
  await p.keyboard.press("Home");
  const first = await readout();
  log(/Nov 23|Nov 2023/.test(first), `Home jumps to first month (${first.split("\n")[1]})`);

  // table sort
  const rowsText = async () => p.locator("table tbody tr td:first-child a").allInnerTexts();
  const r0 = await rowsText();
  await p.getByRole("button", { name: /^Asset/ }).click();
  const r1 = await rowsText();
  const sortedAsc = [...r1].sort((a, b) => a.localeCompare(b));
  log(JSON.stringify(r1) === JSON.stringify(sortedAsc) && JSON.stringify(r0) !== JSON.stringify(r1), "table sorts by asset name ascending");
  log((await p.locator("th[aria-sort='ascending']").count()) === 1, "aria-sort set on sorted column");
  await p.getByRole("button", { name: /^Value/ }).click();
  const v1 = await p.locator("table tbody tr td:nth-child(5)").allInnerTexts();
  const nums = v1.map((t) => Number(t.replace(/[^\d]/g, "")));
  log(nums.every((x, i) => i === 0 || nums[i - 1] <= x) || nums.every((x, i) => i === 0 || nums[i - 1] >= x), "value column is monotonic after sort");
  log((await p.locator("th", { hasText: "Net yield" }).count()) === 1, "manager sees per-asset net yield column");

  // map
  const markers = await p.locator("button.maplibregl-marker").count();
  const fb = await p.locator('svg[aria-label*="Schematic map"]').count();
  log(markers === 30 || fb === 1, `map renders (${markers} asset markers, svg fallback=${fb})`);
  await p.locator('[aria-label="Schematic map of assets and district heat"]').first().scrollIntoViewIfNeeded();
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/en-map.png`, clip: undefined, fullPage: true });
  if (markers) {
    await p.locator("button.maplibregl-marker").first().click({ force: true });
    log(await p.locator("main a[href*='/asset/A-']").last().isVisible(), "clicking a marker shows the asset link");
  }
  // USD
  await p.getByRole("button", { name: "USD" }).first().click(); await settle(p);
  log(/USD [\d.]+m/.test(await p.locator("main").innerText()), "USD toggle on portfolio");
  await p.getByRole("button", { name: "EGP" }).first().click(); await settle(p);

  // asset detail (manager)
  await p.goto(`${BASE}/en/asset/A-001`); await settle(p);
  await p.screenshot({ path: `${OUT}/en-asset-manager.png`, fullPage: true });
  log(await p.getByRole("heading", { name: "Income and costs, last 12 months" }).isVisible(), "asset: income and costs visible to manager");
  log(await p.getByRole("heading", { name: "Risk", exact: true }).isVisible(), "asset: risk panel");
  log(await p.getByText("Value against cost").isVisible(), "asset: value vs cost chart");
  await p.goto(`${BASE}/en/asset/A-011`); await settle(p);
  log(await p.getByText(/Vacant for \d+ days/).isVisible(), "asset A-011: vacancy risk reason");
  await p.goto(`${BASE}/en/asset/A-006`); await settle(p);
  log(await p.getByText("1 documents need attention").isVisible() || await p.getByText(/documents need attention/).isVisible(), "asset A-006: missing deed flagged");
  await c.close();

  // ---- Investor
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "investor");
  await p.goto(`${BASE}/en/portfolio`); await settle(p);
  await p.screenshot({ path: `${OUT}/en-portfolio-investor.png`, fullPage: true });
  log((await p.locator("th", { hasText: "Net yield" }).count()) === 0, "investor: no per-asset net yield column");
  log(await p.getByText("Aggregate only.").isVisible(), "investor: aggregate yield note shown");
  await p.goto(`${BASE}/en/asset/A-001`); await settle(p);
  log(await p.getByText("Income and costs are hidden for the Investor role").isVisible(), "investor: asset income panel hidden");
  await p.screenshot({ path: `${OUT}/en-asset-investor.png`, fullPage: true });
  await c.close();

  // ---- Arabic desktop (dark, the brand look) + RTL checks
  ({ c, p } = await open({ width: 1360, height: 900 }, "dark"));
  await signIn(p, "ar", "manager");
  for (const a of ["portfolio", "asset/A-001", "asset/A-011"]) {
    await p.goto(`${BASE}/ar/${a}`); await settle(p);
    await p.screenshot({ path: `${OUT}/ar-${a.replace("/", "-")}-dark.png`, fullPage: true });
    log((await p.getAttribute("html", "dir")) === "rtl", `AR /${a} dir=rtl`);
  }
  await p.goto(`${BASE}/ar/portfolio`); await settle(p);
  const arChart = p.getByRole("group", { name: /قيمة المحفظة/ });
  await arChart.scrollIntoViewIfNeeded();
  const ab = await arChart.boundingBox();
  const a0 = await p.locator('[aria-live="polite"]').first().innerText();
  await p.mouse.move(ab.x + ab.width * 0.3, ab.y + ab.height / 2); await p.waitForTimeout(300);
  log(a0 !== (await p.locator('[aria-live="polite"]').first().innerText()), "AR chart scrubs");
  const arDir = await arChart.evaluate((el) => getComputedStyle(el).direction);
  log(arDir === "ltr", "AR chart keeps time left-to-right");
  const mk = await p.locator("button.maplibregl-marker").count(); const fb2 = await p.locator('svg[aria-label*="خريطة"]').count();
  log(mk === 30 || fb2 === 1, `AR map renders (${mk} markers, fallback ${fb2})`);
  await c.close();

  // ---- Phone
  for (const loc of ["en", "ar"]) {
    ({ c, p } = await open({ width: 390, height: 844 }, "light", 2));
    await signIn(p, loc, "manager");
    for (const a of ["portfolio", "asset/A-001", "asset/A-011"]) {
      await p.goto(`${BASE}/${loc}/${a}`); await settle(p); await noH(p, `${loc} /${a} @390`);
      await p.screenshot({ path: `${OUT}/${loc}-${a.replace("/", "-")}-phone.png`, fullPage: true });
    }
    await c.close();
  }
  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
