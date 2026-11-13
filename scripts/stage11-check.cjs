const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-11";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(rep|nav|gov2|governance)\.[A-Za-z_]+\b(?!\.[a-z]{2,4}\b)/;
const NAMES = { manager1: ["Nour Abdelrahman", "نور عبد الرحمن"], investor: ["Karim Fahmy", "كريم فهمي"], admin: ["Salma Rashed", "سلمى راشد"] };

/** Stage 11: reports and exports — the grouped sidebar, Excel/CSV exports, PDF statements, scheduled reports. */
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const errors = [];
  const open = async (viewport, scheme = "light") => {
    const c = await browser.newContext({ viewport, colorScheme: scheme, acceptDownloads: true });
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
  const download = async (p, locator) => { const [d] = await Promise.all([p.waitForEvent("download"), locator.click()]); const file = await d.path(); return { name: d.suggestedFilename(), bytes: fs.readFileSync(file) }; };

  // ================= Manager =================
  let { c, p } = await open({ width: 1440, height: 900 });
  await signIn(p, "en", "manager1");
  const side = p.getByRole("navigation", { name: "Main navigation" }).first();
  const heads = await side.locator("p").allInnerTexts();
  log(JSON.stringify(heads) === JSON.stringify(["Portfolio", "Operations", "Money", "Records"]), `sidebar is grouped (${heads.join(", ")})`);
  log(await side.getByRole("link").count() === 12, "manager sees twelve areas (calendar added in stage 13)");
  await p.screenshot({ path: `${OUT}/en-sidebar.png` });
  await side.getByRole("link", { name: "Reports" }).click();
  await p.waitForURL("**/en/reports"); await settle(p);
  log((await p.title()) === "Reports and exports · ZMNHOOF OS", "Reports page has its own title");
  log(await p.getByRole("tabpanel", { name: "Exports" }).locator("li").count() === 7, "manager can export seven datasets");
  const x = await download(p, p.getByRole("link", { name: "Download Unpaid rent as Excel" }));
  log(x.bytes.subarray(0, 2).toString() === "PK" && /^zmnhoof-rent-2026-11-12-en\.xlsx$/.test(x.name), `Excel download is a workbook (${x.name}, ${x.bytes.length} bytes)`);
  const csv = await download(p, p.getByRole("link", { name: "Download Ledger as CSV" }));
  const text = csv.bytes.toString("utf8");
  log(text.charCodeAt(0) === 0xfeff && text.includes("Date,Category,Asset,Amount (EGP),Description,Source,Line"), "CSV download has a byte-order mark and English headers");
  await axe(p, "reports exports");
  await p.screenshot({ path: `${OUT}/en-exports.png`, fullPage: true });

  await p.getByRole("tab", { name: "Statements" }).click();
  const pdf = await download(p, p.getByRole("link", { name: "Download the 2026-Q3 statement in English" }));
  log(pdf.bytes.subarray(0, 5).toString() === "%PDF-", `statement is a PDF (${pdf.bytes.length} bytes)`);
  const pdfAr = await download(p, p.getByRole("link", { name: "Download the 2026 statement in العربية" }));
  log(pdfAr.bytes.subarray(0, 5).toString() === "%PDF-", "Arabic statement is a PDF");

  await p.getByRole("tab", { name: /Scheduled/ }).click();
  await p.locator("li", { hasText: "RS-001" }).getByRole("button", { name: "Run now" }).click();
  await p.getByText(/Built RR-[0-9a-f]+ and sent to 1 recipients\. Next run 2026-12-01\./).waitFor({ timeout: 30000 });
  log(true, "Run now builds and sends a report without moving its schedule");
  await p.reload(); await settle(p);
  const runs = p.getByRole("list", { name: "Recent reports" });
  const rx = await download(p, runs.getByRole("link", { name: "Download" }).first());
  log(rx.bytes.subarray(0, 2).toString() === "PK", "a stored report downloads again");
  await p.getByRole("button", { name: "New schedule" }).click();
  const ns = p.getByRole("dialog", { name: "New schedule" });
  await ns.getByLabel("Name").fill("Quarterly arrears pack");
  await ns.getByLabel("Report").selectOption("workbook_management");
  await ns.getByLabel("Unpaid rent").check();
  await ns.getByLabel("How often").selectOption("quarterly");
  await ns.getByLabel("Day of the month").fill("5");
  await ns.getByLabel("Send to").fill("nour@sample.test");
  await ns.getByRole("button", { name: "Schedule it" }).click();
  await p.getByText(/RS-004 scheduled; first run 2027-02-05\./).waitFor();
  log(true, "a new schedule gets its first run date");
  await axe(p, "scheduled reports");
  await leak(p, "reports");
  await p.screenshot({ path: `${OUT}/en-scheduled.png`, fullPage: true });
  await c.close();

  // ================= Investor =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "investor");
  await p.goto(`${BASE}/en/reports`); await settle(p);
  log(await p.getByRole("tab", { name: /Scheduled/ }).count() === 0, "investors have no scheduled reports");
  log(await p.getByRole("tabpanel", { name: "Exports" }).locator("li").count() === 4, "investors can export four datasets");
  const li = await download(p, p.getByRole("link", { name: "Download Leases and tenants as CSV" }));
  const lt = li.bytes.toString("utf8");
  log(!/Monthly rent|arrears/i.test(lt) && lt.split("\r\n").length > 10, "the investor's lease export has no rent or arrears");
  await c.close();

  // ================= Administrator =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "admin");
  const aside = p.getByRole("navigation", { name: "Main navigation" }).first();
  log(JSON.stringify(await aside.locator("p").allInnerTexts()) === JSON.stringify(["Portfolio", "Records"]), "administrator's sidebar shows only its sections");
  await aside.getByRole("link", { name: "Reports" }).click(); await p.waitForURL("**/en/reports"); await settle(p);
  log(await p.getByRole("tab").count() === 1 && await p.getByRole("tabpanel", { name: "Exports" }).locator("li").count() === 1, "administrator can export the audit log only");
  const au = await download(p, p.getByRole("link", { name: "Download Audit log as CSV" }));
  log(au.bytes.toString("utf8").includes("Previous hash"), "audit export carries the hash chain");
  await c.close();

  // ================= Phone, Arabic =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await signIn(p, "ar", "manager1");
  await p.goto(`${BASE}/ar/reports`); await settle(p);
  await noH(p, "ar reports @390");
  await leak(p, "ar reports");
  await p.screenshot({ path: `${OUT}/ar-reports-phone.png`, fullPage: true });
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
