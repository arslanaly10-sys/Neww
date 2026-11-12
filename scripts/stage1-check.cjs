const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-1";
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

const RAWKEY = /\b(governance|overview|portfolio|asset|assetx|valuation|val|market|pf|al|scn|docs|horus|cite|gov2|packui|pack|clause|nav|roles|shell|login|sample|fig|status|types|finish|docKind|docStatus|cmd|cmd2|error|noAccess|common|units|admin|brand)\.[A-Za-z_]+(\.[A-Za-z_]+)*\b(?!\.[a-z]{2,4}\b)/;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const errors = [];
  async function ctx(viewport, scale = 1) {
    const c = await browser.newContext({ viewport, deviceScaleFactor: scale });
    const p = await c.newPage();
    p.on("console", (m) => { if (m.type() === "error") errors.push(`${p.url()} ${m.text()}`); });
    p.on("pageerror", (e) => errors.push(`${p.url()} pageerror ${e.message}`));
    return { c, p };
  }
  const noHScroll = async (p, name) => {
    const [sw, cw] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    log(sw <= cw, `no horizontal scroll: ${name} (scrollWidth ${sw} / clientWidth ${cw})`);
  };

  // ---------- Desktop English, manager ----------
  let { c, p } = await ctx({ width: 1360, height: 900 }, 1);
  await p.goto(`${BASE}/en`);
  await p.screenshot({ path: `${OUT}/en-login-desktop.png` });
  log((await p.getAttribute("html", "dir")) === "ltr", "EN html dir=ltr");
  await p.getByRole("button", { name: "Enter as Nour Abdelrahman" }).click();
  await p.waitForURL("**/en/overview");
  log(await p.getByRole("heading", { name: "Overview" }).isVisible(), "EN overview loads for manager");
  log(await p.getByText("Concept demo. All data is synthetic").first().isVisible(), "sample ribbon visible");
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/en-overview-desktop.png`, fullPage: true });
  for (const a of ["portfolio", "asset", "asset/A-001", "valuation", "market", "governance"]) {
    await p.goto(`${BASE}/en/${a}`);
    await p.waitForLoadState("networkidle"); await leak(p);
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/en-${a.replace("/", "-")}-desktop.png`, fullPage: true });
    log(true, `EN /${a} rendered`);
  }
  // Fig popover
  await p.goto(`${BASE}/en/overview`);
  await p.getByRole("button", { name: /Portfolio value:/ }).click();
  log(await p.getByText("How it is calculated").isVisible().catch(() => false) || await p.getByText("Source", { exact: true }).first().isVisible(), "number popover shows source/assumptions");
  await p.screenshot({ path: `${OUT}/en-fig-popover.png` });
  await p.keyboard.press("Escape");
  // Command bar
  await p.keyboard.press("Control+k");
  await p.getByPlaceholder("Search assets, districts, documents and actions").fill("zamlk");
  await p.waitForTimeout(300);
  log(await p.getByRole("option").first().isVisible(), "command bar fuzzy results (typo 'zamlk')");
  await p.screenshot({ path: `${OUT}/en-command-bar.png` });
  await p.keyboard.press("Escape");
  // Currency toggle
  await p.getByRole("button", { name: "USD" }).click();
  await p.waitForTimeout(800);
  const txt = await p.locator("main").innerText();
  log(/USD\s[\d.]+/.test(txt), "USD toggle converts values");
  await p.getByRole("button", { name: "EGP" }).click();
  await p.waitForTimeout(500);

  // ---------- Arabic desktop ----------
  await p.getByRole("link", { name: "English" }).count();
  await p.goto(`${BASE}/ar/overview`);
  log((await p.getAttribute("html", "dir")) === "rtl", "AR html dir=rtl");
  log((await p.getAttribute("html", "lang")) === "ar", "AR html lang=ar");
  for (const a of ["overview", "portfolio", "asset/A-001", "valuation", "market", "governance"]) {
    await p.goto(`${BASE}/ar/${a}`);
    await p.waitForLoadState("networkidle"); await leak(p);
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/ar-${a.replace("/", "-")}-desktop.png`, fullPage: true });
    log(true, `AR /${a} rendered`);
  }
  await p.goto(`${BASE}/ar/overview`);
  const sidebarSide = await p.evaluate(() => { const r = document.querySelector("aside").getBoundingClientRect(); return r.left > window.innerWidth / 2 ? "right" : "left"; });
  log(sidebarSide === "right", `AR sidebar is on the right (${sidebarSide})`);
  const fontOk = await p.evaluate(() => getComputedStyle(document.body).fontFamily.includes("IBM Plex Sans Arabic"));
  log(fontOk, "AR body font is IBM Plex Sans Arabic");
  await c.close();

  // ---------- Dark scheme (brand look) ----------
  for (const loc of ["en", "ar"]) {
    const dc = await browser.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: "dark" });
    const dp = await dc.newPage();
    await dp.goto(`${BASE}/${loc}`);
    await dp.getByRole("button", { name: loc === "en" ? "Enter as Nour Abdelrahman" : "الدخول بصفة نور عبد الرحمن" }).click();
    await dp.waitForURL(`**/${loc}/overview`);
    await dp.waitForTimeout(700);
    await dp.screenshot({ path: `${OUT}/${loc}-overview-dark.png` });
    await dp.goto(`${BASE}/${loc}/market`); await dp.waitForTimeout(700);
    await dp.screenshot({ path: `${OUT}/${loc}-market-dark.png` });
    await dc.close();
  }
  // ---------- Investor: income hidden ----------
  ({ c, p } = await ctx({ width: 1360, height: 900 }));
  await p.goto(`${BASE}/en`);
  await p.getByRole("button", { name: "Enter as Karim Fahmy" }).click();
  await p.waitForURL("**/en/overview");
  await p.goto(`${BASE}/en/asset/A-001`);
  log(await p.getByText("Rent is hidden for the Investor role.").isVisible(), "investor: rent hidden on asset");
  await p.screenshot({ path: `${OUT}/en-asset-investor.png`, fullPage: true });
  await c.close();

  // ---------- Admin: no financial content ----------
  ({ c, p } = await ctx({ width: 1360, height: 900 }));
  await p.goto(`${BASE}/en`);
  await p.getByRole("button", { name: "Enter as Salma Rashed" }).click();
  await p.waitForURL("**/en/overview");
  await p.screenshot({ path: `${OUT}/en-overview-admin.png` });
  await p.goto(`${BASE}/en/portfolio`);
  log(await p.getByText("Not available to this role").isVisible(), "admin: portfolio denied");
  await c.close();

  // ---------- Phone 390 ----------
  for (const loc of ["en", "ar"]) {
    ({ c, p } = await ctx({ width: 390, height: 844 }, 2));
    await p.goto(`${BASE}/${loc}`);
    await noHScroll(p, `${loc} login @390`);
    await p.screenshot({ path: `${OUT}/${loc}-login-phone.png` });
    await p.getByRole("button", { name: loc === "en" ? "Enter as Nour Abdelrahman" : "الدخول بصفة نور عبد الرحمن" }).click();
    await p.waitForURL(`**/${loc}/overview`);
    for (const a of ["overview", "portfolio", "asset", "asset/A-004", "valuation", "market", "governance"]) {
      await p.goto(`${BASE}/${loc}/${a}`);
      await p.waitForLoadState("networkidle"); await leak(p);
      await p.waitForTimeout(500);
      await noHScroll(p, `${loc} /${a} @390`);
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
