const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-19";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(ops|einv|nav|ntf|gov2)\.[A-Za-z_]+\b(?!\.[a-z]{2,4}\b)/;

/** Stage 19: inspections, contractors, utilities, capital works and e-invoice drafts. */
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

  // ================= Manager 1: inspections, contractors, utilities, capex proposal =================
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "Enter as Nour Abdelrahman");
  await p.goto(`${BASE}/en/maintenance`); await settle(p);
  const ops = p.getByRole("navigation", { name: "Operations" });
  log(await ops.getByRole("link", { name: "Work board" }).getAttribute("aria-current") === "page", "the work board is the current operations tab");
  await ops.getByRole("link", { name: "Inspections" }).click();
  await p.waitForURL("**/en/maintenance/inspections"); await settle(p);
  log((await p.title()) === "Inspections · ZMNHOOF OS", "inspections has its own title");
  log(await p.getByRole("list", { name: "Findings of IS-001" }).getByRole("link", { name: "Work order WO-001" }).isVisible(), "a finding links to the work order raised from it");
  await p.getByRole("button", { name: "Schedule an inspection" }).click();
  const dlg = p.getByRole("dialog");
  await dlg.getByLabel("Asset", { exact: true }).selectOption("A-001");
  await dlg.getByLabel("Kind").selectOption("move_out");
  await dlg.getByLabel("Date").fill("2026-11-20");
  await dlg.getByLabel("Inspector").selectOption("u-manager-2");
  await dlg.getByRole("button", { name: "Schedule an inspection" }).click();
  await p.getByText("Inspection IS-007 scheduled.").waitFor({ timeout: 15000 });
  log(true, "an inspection is scheduled");
  await p.getByRole("button", { name: /Record the result of IS-007/ }).click();
  const rd = p.getByRole("dialog");
  await rd.getByLabel("Area, finding 1").fill("Kitchen");
  await rd.getByLabel("Severity").selectOption("high");
  await rd.getByLabel("What was found").fill("Hob not working.");
  await rd.getByRole("button", { name: "Save the result" }).click();
  await p.getByText(/Result recorded. Work orders raised: WO-/).waitFor({ timeout: 15000 });
  await p.reload(); await settle(p);
  log(await p.getByRole("list", { name: "Findings of IS-007" }).getByRole("link", { name: /Work order WO-/ }).isVisible(), "recording a finding raises a work order");
  await axe(p, "inspections");
  await leak(p, "inspections");
  await p.screenshot({ path: `${OUT}/en-inspections.png`, fullPage: true });

  await ops.getByRole("link", { name: "Contractors" }).click();
  await p.waitForURL("**/en/maintenance/contractors"); await settle(p);
  const ct = p.getByRole("table", { name: "Contractors and their performance" });
  log(await ct.locator("tbody tr").count() === 7, "seven contractors listed");
  log(await ct.getByRole("columnheader", { name: "Cost against estimate" }).isVisible(), "managers see cost against estimate");
  await p.getByRole("button", { name: "Add a contractor" }).click();
  const cd = p.getByRole("dialog");
  await cd.getByLabel("Name", { exact: true }).fill("Giza Glass (fictional)");
  await cd.getByLabel("Trade").selectOption("general");
  await cd.getByLabel("Email").fill("hi@giza-glass.example");
  await cd.getByRole("button", { name: "Add" }).click();
  await p.getByText("Contractor CT-008 added.").waitFor({ timeout: 15000 });
  await ct.getByText("Giza Glass (fictional)").waitFor({ timeout: 15000 }).catch(() => {});
  log(await ct.locator("tbody tr").count() === 8, "a contractor is added");
  await p.waitForTimeout(800);
  await axe(p, "contractors");
  await p.screenshot({ path: `${OUT}/en-contractors.png`, fullPage: true });

  await ops.getByRole("link", { name: "Utilities" }).click();
  await p.waitForURL("**/en/maintenance/utilities"); await settle(p, 2200);
  log(await p.getByText(/Spike: .* m³ from 28 Aug 2026 to 28 Sept 2026/).isVisible(), "the September water spike at A-008 is flagged");
  await p.getByLabel("Asset", { exact: true }).selectOption("A-001");
  await p.getByLabel("Utility").selectOption("electricity");
  await p.getByLabel("Meter reading").fill("10");
  await p.getByRole("button", { name: "Add the reading" }).click();
  await p.getByText("The new value cannot be earlier or lower than the last one.").waitFor({ timeout: 15000 });
  log(true, "a lower meter reading is refused");
  await p.getByLabel("Meter reading").fill("999999");
  await p.getByRole("button", { name: "Add the reading" }).click();
  await p.getByText(/Reading saved. This period is a spike/).waitFor({ timeout: 15000 });
  log(true, "a reading far above the trend is saved and flagged");
  await axe(p, "utilities");
  await leak(p, "utilities");
  await p.screenshot({ path: `${OUT}/en-utilities.png`, fullPage: true });

  await ops.getByRole("link", { name: "Capital works" }).click();
  await p.waitForURL("**/en/maintenance/capex"); await settle(p);
  await p.getByRole("button", { name: "Propose capital works" }).click();
  const xd = p.getByRole("dialog");
  await xd.getByLabel("Asset", { exact: true }).selectOption("A-001");
  await xd.getByLabel("Title", { exact: true }).fill("New kitchen");
  await xd.getByLabel("Category").selectOption("interior");
  await xd.getByLabel("Budget").fill("300000");
  await xd.getByRole("button", { name: "Send for approval" }).click();
  await p.getByText("CX-006 sent for approval.").waitFor({ timeout: 15000 });
  log(await p.getByText("Waiting for another manager to decide.").first().isVisible(), "the proposer cannot approve their own works");
  await axe(p, "capex");
  await p.screenshot({ path: `${OUT}/en-capex.png`, fullPage: true });

  // E-invoice draft
  await p.goto(`${BASE}/en/leases`); await settle(p);
  await p.getByRole("link", { name: "E-invoice drafts" }).click();
  await p.waitForURL("**/en/leases/einvoices"); await settle(p);
  log(await p.getByText(/Drafts only. Nothing is signed or sent/).isVisible(), "e-invoices are labelled as unsigned drafts");
  await p.getByRole("table", { name: "Rent invoices available as drafts" }).locator("tbody tr th a").first().click();
  await p.waitForURL("**/en/leases/einvoices/RI-*"); await settle(p);
  log(await p.getByText("Digital signature").isVisible() && await p.getByText(/Not signed/).isVisible(), "the signature check fails honestly");
  log(!(await p.getByText("Ready to sign").count()), "a draft is never shown as ready");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Download the JSON draft" }).click()]);
  const j = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  log(/UNSIGNED DRAFT/.test(j._note) && j.documents[0].documentType === "I", "the JSON draft downloads in the ETA document shape");
  await axe(p, "e-invoice draft");
  await leak(p, "e-invoice draft");
  await p.screenshot({ path: `${OUT}/en-einvoice.png`, fullPage: true });
  await c.close();

  // ================= Manager 2: approves, records progress =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "Enter as Omar Saleh");
  await p.goto(`${BASE}/en/maintenance/capex`); await settle(p);
  await p.getByRole("button", { name: "Approve CX-006, New kitchen" }).click();
  await p.getByText("Approved.").waitFor({ timeout: 15000 });
  await p.getByLabel("Spent so far, EGP").first().waitFor();
  log(true, "another manager approves the works");
  await p.goto(`${BASE}/en/notifications`); await settle(p);
  const nt = await p.getByText(/Inspection IS-007 at A-001/).first().textContent().catch(() => null);
  log(!!nt, `the inspector was notified (${nt ?? (await p.locator("main").innerText()).slice(0, 300)})`);
  await c.close();

  // ================= Investor: inspections and contractors, no costs =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "Enter as Karim Fahmy");
  await p.goto(`${BASE}/en/maintenance/contractors`); await settle(p);
  const nav2 = p.getByRole("navigation", { name: "Operations" });
  log(!(await nav2.getByRole("link", { name: "Capital works" }).count()) && !(await nav2.getByRole("link", { name: "Utilities" }).count()), "investors do not get the cost tabs");
  log(!(await p.getByRole("columnheader", { name: "Cost against estimate" }).count()), "investors do not see contractor costs");
  await p.goto(`${BASE}/en/maintenance/capex`); await settle(p);
  log(await p.getByRole("heading", { name: "Not available to this role" }).first().isVisible(), "capital works are closed to investors");
  await c.close();

  // ================= Arabic phone =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await signIn(p, "ar", "الدخول بصفة نور عبد الرحمن");
  for (const path of ["inspections", "utilities", "capex"]) {
    await p.goto(`${BASE}/ar/maintenance/${path}`); await settle(p, 2000);
    await noH(p, `ar ${path} @390`);
    await axe(p, `ar ${path} phone`);
    await leak(p, `ar ${path} phone`);
    await p.screenshot({ path: `${OUT}/ar-${path}-phone.png`, fullPage: true });
  }
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
