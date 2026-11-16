const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-22";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(docs|nav|ntf|gov2|permits|climate)\.[A-Za-z_]+\b(?!\.[a-z]{2,4}\b)/;

/** Stage 22: reading permits and surveys from documents into the records. */
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

  // ================= Manager: upload the certificate, check the conflict, confirm =================
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "Enter as Nour Abdelrahman");
  await p.goto(`${BASE}/en/asset/documents`); await settle(p);
  await p.locator("#doc-file").setInputFiles("public/samples/sample-permit-civil-defence.pdf");
  await p.getByRole("heading", { name: /sample-permit-civil-defence\.pdf/ }).waitFor({ timeout: 30000 });
  log(true, "an uploaded certificate is recognised and read");
  log(await p.getByLabel("Kind of permit").inputValue() === "civil_defence", "the kind of permit is read as civil defence");
  log(await p.getByText("CP-2026-11873").count() > 0 || await p.getByLabel("Certificate number").inputValue() === "CP-2026-11873", "the certificate number is read");
  log(await p.getByText(/English says 2027-11-07|2027-11-07.*2027-11-08/).first().isVisible(), "the expiry that differs between English and Arabic is shown");
  log(await p.getByRole("button", { name: "Confirm" }).isDisabled(), "confirm waits until the conflict is checked");
  await axe(p, "reader with certificate");
  await leak(p, "reader with certificate");
  await p.screenshot({ path: `${OUT}/en-reader-permit.png`, fullPage: true });
  const expiry = p.locator("li").filter({ has: p.getByLabel("Expiry date") });
  await expiry.getByRole("checkbox").check();
  await p.getByRole("button", { name: "Confirm" }).click();
  await p.getByText(/Permit PM-\d{3} recorded from the document/).waitFor({ timeout: 20000 });
  log(true, "confirming records the permit");
  await p.getByRole("link", { name: "Open the permits" }).click();
  await p.waitForURL("**/en/asset/A-010/record#permits"); await settle(p, 1800);
  log(await p.getByText("CP-2026-11873").first().isVisible() && await p.getByText(/D-901/).first().isVisible(), "the permit carries the reference and links the document");

  // Survey: from the sample button, no checks needed.
  await p.goto(`${BASE}/en/asset/documents`); await settle(p);
  await p.getByRole("button", { name: "Flood survey, English (Gardenia block)" }).click();
  await p.getByLabel("Risk rating").waitFor({ timeout: 30000 });
  log(await p.getByLabel("Hazard assessed").inputValue() === "flood" && await p.getByLabel("Risk rating").inputValue() === "3", "the survey's hazard and rating are read");
  await p.getByRole("button", { name: "Confirm" }).click();
  await p.getByText(/Site assessment CA-\d{3} recorded/).waitFor({ timeout: 20000 });
  await p.getByRole("link", { name: "Open the climate tab" }).click();
  await p.waitForURL("**/en/asset/A-008/record#climate"); await settle(p, 1800);
  log(await p.getByText(/Site assessment: Site survey, 30 Oct 2026/).isVisible(), "the survey now sets the asset's flood level");
  await p.screenshot({ path: `${OUT}/en-record-survey.png`, fullPage: true });
  await c.close();

  // ================= Analyst: the read permit waits for checking =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "Enter as Laila Mansour");
  await p.goto(`${BASE}/en/asset/permits#queue`); await settle(p);
  log(await p.getByRole("list", { name: "Waiting to be checked" }).getByText("Civil defence approval, A-010").isVisible(), "the permit read from the document waits for an analyst");
  await c.close();

  // ================= Arabic phone =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await signIn(p, "ar", "الدخول بصفة نور عبد الرحمن");
  await p.goto(`${BASE}/ar/asset/documents`); await settle(p, 1500);
  await p.getByRole("button", { name: "شهادة الحماية المدنية، ثنائية اللغة (Capital Gate Tower)" }).click();
  await p.getByLabel("نوع الترخيص").waitFor({ timeout: 30000 });
  await noH(p, "ar reader @390");
  await axe(p, "ar reader phone");
  await leak(p, "ar reader phone");
  await p.screenshot({ path: `${OUT}/ar-reader-phone.png`, fullPage: true });
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
