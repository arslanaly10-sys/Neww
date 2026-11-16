const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-23";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(einv|nav|ntf|gov2)\.[A-Za-z_]+\b(?!\.[a-z]{2,4}\b)/;

/** Stage 23: approving and signing e-invoice drafts (test key). */
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

  // ================= Manager 1 approves =================
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "Enter as Nour Abdelrahman");
  await p.goto(`${BASE}/en/leases/einvoices`); await settle(p);
  const table = p.getByRole("table", { name: "Rent invoices available as drafts" });
  log(await table.getByText("Draft").first().isVisible(), "every invoice starts as a draft");
  const link = table.locator("tbody tr th a").first();
  const invoiceId = (await link.innerText()).trim();
  await link.click();
  await p.waitForURL(`**/en/leases/einvoices/${invoiceId}`); await settle(p);
  const track = p.getByRole("list", { name: "Steps to submission" });
  log(await track.getByText("Submitted to the Tax Authority: blocked").count() === 1, "submission is shown as blocked");
  log(await track.getByText(/accepts only signatures made with a certificate issued under ITIDA/).isVisible(), "the reasons are listed");
  await p.getByRole("button", { name: "Approve this draft" }).click();
  await p.getByText("Approved. Another manager can now sign it.").waitFor({ timeout: 15000 });
  await p.reload(); await settle(p);
  log(await p.getByText("Waiting for another manager to sign. You approved it, so you cannot sign it.").isVisible(), "the approver cannot sign");
  await axe(p, "approved draft");
  await leak(p, "approved draft");
  await c.close();

  // ================= Manager 2 signs, verifies, downloads =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "Enter as Omar Saleh");
  await p.goto(`${BASE}/en/notifications`); await settle(p);
  log(await p.getByText(new RegExp(`E-invoice EI-\\d{3} for ${invoiceId} is approved and waiting to be signed`)).first().isVisible(), "the second manager is asked to sign");
  await p.goto(`${BASE}/en/leases/einvoices/${invoiceId}`); await settle(p);
  await p.getByRole("button", { name: "Sign with the test key" }).click();
  await p.getByText("Signed.").waitFor({ timeout: 15000 });
  await p.reload(); await settle(p, 1500);
  log(await p.getByText(/^By Omar Saleh, .*, with SK-TEST-[0-9A-F]{8}$/).isVisible(), "who signed and with which key is shown");
  await p.getByRole("button", { name: "Check the signature" }).click();
  await p.getByText("The signature is valid and the document has not changed since it was approved.").waitFor({ timeout: 15000 });
  log(true, "the signature verifies");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Download the signed JSON" }).click()]);
  const j = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  log(/TEST KEY/.test(j._note) && j.documents[0].signatures[0].signatureType === "I" && /^[0-9a-f]{64}$/.test(j.canonicalSha256), "the signed JSON carries the signature and says it is a test");
  log(await p.getByText(/Signed with the test key SK-TEST-/).isVisible(), "the signature check stays honest after signing");
  await axe(p, "signed draft");
  await p.screenshot({ path: `${OUT}/en-signed.png`, fullPage: true });
  await p.goto(`${BASE}/en/leases/einvoices`); await settle(p);
  log(await p.getByRole("table", { name: "Rent invoices available as drafts" }).getByText("Signed (test key)").isVisible(), "the list shows the signed stage");
  await c.close();

  // ================= Arabic phone =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await signIn(p, "ar", "الدخول بصفة نور عبد الرحمن");
  await p.goto(`${BASE}/ar/leases/einvoices/${invoiceId}`); await settle(p, 1500);
  await noH(p, "ar signed draft @390");
  await axe(p, "ar signed draft phone");
  await leak(p, "ar signed draft phone");
  await p.screenshot({ path: `${OUT}/ar-signed-phone.png`, fullPage: true });
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
