const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-17";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(hv|record|nav|ntf)\.[A-Za-z_]+\b(?!\.[a-z]{2,4}\b)/;

/** Stage 17: the public HORUS questionnaire, its evidence report, and an analyst signing off an asset run. */
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
  const settle = async (p, ms = 1500) => { await p.waitForLoadState("load"); await p.waitForTimeout(ms); };
  const axe = async (p, name) => { await p.evaluate(axeSrc); const r = await p.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })); log(r.violations.length === 0, `axe: ${name} (${r.violations.map((v) => `${v.id}:${v.nodes.length}`).join(", ") || "0 violations"})`); };
  const noH = async (p, name) => { const [a, b] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); log(a <= b, `no horizontal scroll: ${name} (${a}/${b})`); };
  const leak = async (p, where) => { const t = await p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.parentElement || n.parentElement.closest(".num, pre, code, script, style, [hidden]")) continue; out.push(n.textContent); } return out.join(" "); }); const m = t.replace(/\S+@\S+/g, "").match(RAWKEY); log(!m, `no raw message keys: ${where}${m ? ` (${m[0]})` : ""}`); };

  // ================= Public questionnaire, desktop =================
  let { c, p } = await open({ width: 1360, height: 900 });
  await p.goto(`${BASE}/en`); await settle(p, 2500);
  await p.getByRole("link", { name: "Evaluate your property" }).click();
  await p.waitForURL("**/en/evaluate"); await settle(p);
  log((await p.title()) === "What is your property worth? · ZMNHOOF OS", "the questionnaire has its own title");
  await axe(p, "questionnaire step 1");
  await p.getByText("Villa", { exact: true }).click();
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByLabel("District").selectOption({ label: "Sheikh Zayed" });
  await p.getByRole("button", { name: "Next" }).click();
  log(await p.getByText(/give the plot and the built-up area separately/).waitFor({ timeout: 5000 }).then(async () => p.getByLabel("Plot area (m²)").isVisible(), () => false), "a villa is asked for its plot separately");
  await p.getByLabel("Built-up area (m²)").fill("380");
  await p.getByLabel("Plot area (m²)").fill("850");
  await p.getByLabel("Year built").fill("2017");
  await p.getByLabel("Condition").selectOption("fully_finished");
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByText("Off-plan", { exact: true }).click();
  log(await p.getByLabel("Expected handover").isVisible(), "off-plan asks for the handover date and instalments");
  await p.getByText("Ready", { exact: true }).click();
  await p.getByText("Garden", { exact: true }).click();
  await p.getByText("Pool", { exact: true }).click();
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByText("Considering a sale", { exact: true }).click();
  await p.getByLabel("Purchase price (EGP)").fill("30000000");
  await p.getByLabel("Purchase date").fill("2022-05-01");
  await p.getByRole("button", { name: "Next" }).click();
  log(await p.getByRole("heading", { name: "Check and continue" }).isVisible(), "the last step reviews the answers");
  await p.waitForTimeout(700); // the step finishes sliding in before contrast is measured
  await axe(p, "questionnaire review");
  await p.screenshot({ path: `${OUT}/en-review.png` });
  await p.getByRole("button", { name: "See the illustrative result" }).click();
  await p.waitForURL(/\/en\/evaluate\/IK-/); await settle(p, 2500);
  log(await p.getByText("Illustrative", { exact: true }).isVisible(), "the result is labelled illustrative");
  log(await p.getByRole("heading", { name: /to/, level: 2 }).first().isVisible() && await p.getByText(/^Most likely/).isVisible(), "a range and the most likely value");
  log(await p.getByRole("table", { name: "The evidence" }).isVisible(), "the comparables are shown with their adjustments");
  log(await p.getByText(/Registered sale|Signed contract|Asking price/).first().isVisible(), "each comparable is labelled by evidence type");
  log(await p.getByRole("region", { name: "The evidence" }).isVisible() && (await p.locator("#hv-methods + ul > li").allInnerTexts()).some((x) => /^Cost/.test(x) && /%/.test(x)), "the cost method applies to a villa");
  log(await p.getByText(/In 2022-05 prices/).isVisible() && await p.getByText(/sample rate/).isVisible(), "inflation and dollar views are labelled");
  await axe(p, "result");
  await leak(p, "result");
  await p.screenshot({ path: `${OUT}/en-result.png`, fullPage: true });
  await p.getByLabel("Name").fill("Mona Sample");
  await p.getByLabel("Email").fill("mona@sample.test");
  await p.getByRole("checkbox").check();
  await p.getByRole("button", { name: "Request a workspace" }).click();
  await p.getByText(/Your request is recorded/).waitFor();
  log(true, "the visitor can keep the result in a workspace");
  await c.close();

  // ================= Manager starts a run; analyst signs it off =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await p.goto(`${BASE}/en`); await p.getByRole("button", { name: "Enter as Nour Abdelrahman" }).click(); await p.waitForURL("**/en/overview");
  await p.goto(`${BASE}/en/asset/A-001/record`); await settle(p);
  await p.getByRole("button", { name: "Run HORUS valuation" }).click();
  await p.waitForURL(/\/en\/valuation\/runs\/VR-/); await settle(p, 2000);
  const runUrl = p.url();
  log(await p.getByText("Waiting for review", { exact: true }).isVisible(), "an asset run waits for review");
  log(await p.getByRole("button", { name: "Sign off" }).count() === 0, "the manager who started it cannot sign it off");
  await c.close();

  ({ c, p } = await open({ width: 1360, height: 900 }));
  await p.goto(`${BASE}/en`); await p.getByRole("button", { name: "Enter as Laila Mansour" }).click(); await p.waitForURL("**/en/overview");
  await p.goto(`${BASE}/en/valuation/runs`); await settle(p);
  log((await p.title()) === "HORUS runs · ZMNHOOF OS", "the runs list has its own title");
  await p.getByRole("tab", { name: /Public questionnaires/ }).click();
  log(await p.getByRole("list", { name: "Public questionnaires" }).getByText(/contact left by Mona Sample/).isVisible(), "analysts see public questionnaires and who left contact details");
  await p.goto(runUrl); await settle(p, 2000);
  await axe(p, "run review");
  await p.getByLabel("Note (needed to send back)").fill("Comparables and adjustments checked.");
  await p.getByRole("button", { name: "Sign off" }).click();
  await p.getByText(/Signed off by Laila Mansour/).waitFor();
  log(true, "the analyst signs it off");
  await p.goto(`${BASE}/en/asset/A-001/record#facts`); await settle(p);
  log(await p.getByText("HORUS estimate (signed off)").isVisible(), "the signed-off estimate joins the asset record");
  await leak(p, "run review");
  await c.close();

  // ================= Arabic phone, questionnaire =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await p.goto(`${BASE}/ar/evaluate`); await settle(p);
  await p.getByText("شقة", { exact: true }).click();
  await p.getByRole("button", { name: "التالي" }).click();
  await p.getByLabel("الحي").selectOption("maadi");
  await p.getByRole("button", { name: "التالي" }).click();
  await p.getByLabel("المساحة المبنية (م²)").fill("160");
  await noH(p, "ar questionnaire @390");
  await axe(p, "ar questionnaire phone");
  await p.screenshot({ path: `${OUT}/ar-intake-phone.png` });
  for (let k = 0; k < 3; k++) await p.getByRole("button", { name: "التالي" }).click();
  await p.getByRole("button", { name: "اعرض النتيجة الاسترشادية" }).click();
  await p.waitForURL(/\/ar\/evaluate\/IK-/); await settle(p, 2500);
  await noH(p, "ar result @390");
  await leak(p, "ar result");
  await axe(p, "ar result phone");
  await p.screenshot({ path: `${OUT}/ar-result-phone.png`, fullPage: true });
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
