const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-20";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(permits|nav|ntf|gov2)\.[A-Za-z_]+\b(?!\.[a-z]{2,4}\b)/;

/** Stage 20: permits and legal status, with four-eyes checking. */
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

  // ================= Manager: register, record a renewal =================
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "Enter as Nour Abdelrahman");
  await p.goto(`${BASE}/en/asset`); await settle(p);
  await p.getByRole("link", { name: "Permits and legal status" }).click();
  await p.waitForURL("**/en/asset/permits"); await settle(p);
  log((await p.title()) === "Permits and legal status · ZMNHOOF OS", "the register has its own title");
  const mx = p.getByRole("table", { name: "Permits by asset" });
  log(await mx.locator("tbody tr").count() === 30, "all 30 assets in the register");
  log(await mx.getByText("Refused").first().isVisible() && await mx.getByText("Expired").first().isVisible(), "refused and expired permits stand out");
  await p.getByRole("link", { name: /^Need action/ }).click();
  await p.waitForURL("**/en/asset/permits?show=action"); await settle(p);
  log(await mx.locator("tbody tr").count() === 2, "the need-action filter narrows to two assets");
  await axe(p, "permit register");
  await leak(p, "permit register");
  await p.screenshot({ path: `${OUT}/en-register.png`, fullPage: true });
  // Open the asset with the lapsed approval and record the renewal.
  const first = mx.locator("tbody tr").filter({ hasText: "Expired" }).first();
  const href = await first.locator("th a").getAttribute("href");
  const assetId = href.match(/A-\d{3}/)[0];
  await first.locator("th a").click();
  await p.waitForURL(`**/en/asset/${assetId}/record#permits`); await settle(p, 1800);
  log(await p.getByRole("tab", { name: /Permits/ }).getAttribute("aria-selected") === "true", "the record opens on its permits tab");
  await p.getByRole("button", { name: `Update or renew Civil defence approval, ${assetId}` }).click();
  const d = p.getByRole("dialog");
  await d.getByLabel("Issued on").fill("2026-11-10");
  await d.getByLabel("Expires (if it does)").fill("2027-11-10");
  await d.getByLabel("Reference").fill("CD-RENEW-1");
  await d.getByRole("button", { name: "Save" }).click();
  await p.getByText(/PM-\d{3} saved and sent for checking\./).waitFor({ timeout: 15000 });
  await p.reload(); await settle(p, 1500);
  log(await p.getByText("Earlier entries (1)").isVisible(), "the old entry is kept as history");
  log(!(await p.getByRole("button", { name: /^Verify / }).count()), "the manager cannot check their own entry");
  await axe(p, "record permits tab");
  await p.screenshot({ path: `${OUT}/en-record-permits.png`, fullPage: true });
  await c.close();

  // ================= Analyst: checks it =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "Enter as Laila Mansour");
  await p.goto(`${BASE}/en/asset/permits#queue`); await settle(p);
  const q = p.getByRole("list", { name: "Waiting to be checked" });
  const before = await q.locator("li").count();
  await q.getByRole("button", { name: `Verify Civil defence approval, ${assetId}` }).click();
  await p.waitForTimeout(1500);
  await p.reload(); await settle(p);
  log(await q.locator("li").count() === before - 1, "the analyst verifies the renewal and it leaves the queue");
  await p.goto(`${BASE}/en/notifications`); await settle(p);
  log(await p.getByText(/Permit PM-\d{3} for A-\d{3} needs checking/).first().isVisible(), "the analyst was asked to check it");
  await c.close();

  // ================= Investor: reads, cannot change =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "Enter as Karim Fahmy");
  await p.goto(`${BASE}/en/asset/${assetId}/record#permits`); await settle(p, 1500);
  log(await p.getByText("Civil defence approval").first().isVisible() && !(await p.getByRole("button", { name: /^Update or renew/ }).count()), "investors read permits without controls");
  await c.close();

  // ================= Arabic phone =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await signIn(p, "ar", "الدخول بصفة نور عبد الرحمن");
  await p.goto(`${BASE}/ar/asset/permits`); await settle(p, 2000);
  await noH(p, "ar register @390");
  await axe(p, "ar register phone");
  await leak(p, "ar register phone");
  await p.screenshot({ path: `${OUT}/ar-register-phone.png`, fullPage: true });
  await p.goto(`${BASE}/ar/asset/A-001/record#permits`); await settle(p, 2000);
  await noH(p, "ar record permits @390");
  await axe(p, "ar record permits phone");
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
