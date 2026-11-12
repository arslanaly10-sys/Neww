const { chromium } = require("playwright");
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-4";
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



(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const errors = [];
  const open = async (viewport, scheme = "light", scale = 1) => {
    const c = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: scale, acceptDownloads: true });
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
  const settle = async (p, ms = 1500) => { await p.waitForLoadState("load"); await p.waitForTimeout(ms); await leak(p); };
  const noH = async (p, name) => { const [a, b] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); log(a <= b, `no horizontal scroll: ${name} (${a}/${b})`); };
  const central = async (p) => (await p.locator("#case-central").innerText()).replace(/\s+/g, " ");
  const num = (s) => Number(s.replace(/[^\d.]/g, ""));

  // ======================= Scenarios: manager =======================
  let { c, p } = await open({ width: 1360, height: 900 });
  await signIn(p, "en", "manager1");
  await p.goto(`${BASE}/en/portfolio/scenarios`); await settle(p);
  log(await p.getByRole("heading", { name: "Scenarios", level: 1 }).isVisible(), "scenarios page loads");
  log((await p.getByRole("slider").count()) === 4, "four sliders");
  const baseText = await central(p);
  log(/0\.0%/.test(baseText), `central case equals base at base assumptions (${baseText.slice(0, 60)})`);
  await p.screenshot({ path: `${OUT}/en-scenarios-desktop.png`, fullPage: true });

  const setNum = async (name, v) => { await p.getByRole("spinbutton", { name }).fill(String(v)); };
  await setNum("Pound per US dollar", 62); await p.waitForTimeout(1800);
  const fxText = await central(p);
  log(fxText !== baseText && !/^.*0\.0% vs base/.test(fxText), "moving the pound recalculates the central case");
  const toEgp = (txt) => { const m = txt.match(/([\d.]+)\s*(bn|m|k)?/i); return Number(m[1]) * ({ bn: 1e9, m: 1e6, k: 1e3 }[(m[2] || "").toLowerCase()] || 1); };
  const valueOf = async () => toEgp(await p.locator("#case-central .font-display").innerText());
  const vFx = await valueOf();
  await setNum("Policy interest rate", 35); await p.waitForTimeout(1800);
  const vRate = await valueOf();
  log(vRate < vFx, `higher policy rate lowers value (${vFx} -> ${vRate})`);
  await setNum("Vacancy shock", 30); await p.waitForTimeout(1800);
  log((await valueOf()) < vRate, "vacancy shock lowers value");
  const lowV = toEgp(await p.locator("#case-low .font-display").innerText()), highV = toEgp(await p.locator("#case-high .font-display").innerText());
  log(lowV < (await valueOf()) && (await valueOf()) < highV, `low < central < high (${lowV} < ${await valueOf()} < ${highV})`);
  const rowsBefore = await p.locator("table tbody tr").count();
  log(rowsBefore === 30, "every asset is listed (30 rows)");
  log((await p.locator("table tbody tr td:nth-child(6)").first().innerText()).trim() !== "–", "manager sees per-asset yield");
  await p.screenshot({ path: `${OUT}/en-scenarios-stressed.png`, fullPage: true });
  await p.getByRole("button", { name: "Reset to base" }).click(); await p.waitForTimeout(1800);
  log(/0\.0%/.test(await central(p)), "reset returns to the base case");

  // keyboard: slider responds to arrow keys
  const slider = p.getByRole("slider", { name: "Vacancy shock" });
  await slider.focus(); await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight"); await p.waitForTimeout(1500);
  log((await p.getByRole("spinbutton", { name: "Vacancy shock" }).inputValue()) === "2", "slider works from the keyboard");
  await p.getByRole("button", { name: "Reset to base" }).click(); await p.waitForTimeout(1200);

  // save, reproduce, load
  await setNum("Pound per US dollar", 58); await setNum("Policy interest rate", 21); await p.waitForTimeout(1600);
  await p.getByLabel("Name").fill("Browser test scenario");
  await p.getByRole("button", { name: "Save scenario" }).click();
  await p.getByText(/Saved as SC-\d{3}/).waitFor();
  const scId = (await p.getByText(/Saved as SC-\d{3}/).innerText()).match(/SC-\d{3}/)[0];
  log(true, `saved ${scId}`);
  await p.waitForTimeout(1200);
  const item = p.locator("li", { hasText: "Browser test scenario" }).first();
  await item.getByRole("button", { name: "Reproduce" }).click();
  await item.getByText(/Reproduced exactly/).waitFor();
  log(true, "saved scenario reproduces exactly from its recorded assumptions");
  await p.locator("li", { hasText: "SC-001" }).first().getByRole("button", { name: "Load" }).click(); await p.waitForTimeout(1600);
  log((await p.getByRole("spinbutton", { name: "Pound per US dollar" }).inputValue()) === "60", "loading SC-001 sets the sliders (pound at 60)");
  await p.screenshot({ path: `${OUT}/en-scenarios-saved.png`, fullPage: true });

  // publish a new version
  await p.getByLabel(/Reason for the change/).fill("Stiffer rate pass-through after review.");
  await p.getByLabel(/Cap-rate pass-through/).fill("0.25");
  await p.getByRole("button", { name: "Publish version" }).click();
  await p.getByText(/Published AS-SCN-1\.1\.0/).waitFor();
  log(true, "new assumption version AS-SCN-1.1.0 published");
  await p.waitForTimeout(1000);
  log((await p.locator("li", { hasText: /^AS-SCN-1\.1\.0/ }).count()) >= 1 && (await p.locator("li", { hasText: /^AS-SCN-1\.0\.0/ }).count()) >= 1, "register lists both versions");
  await p.locator("li", { hasText: "SC-001" }).first().getByRole("button", { name: "Reproduce" }).click();
  await p.locator("li", { hasText: "SC-001" }).first().getByText(/Reproduced exactly|portfolio data has changed/).waitFor();
  log(true, "an older scenario still reproduces on its own version after a new version exists");
  await c.close();

  // ======================= Scenarios: investor =======================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "investor");
  await p.goto(`${BASE}/en/portfolio/scenarios`); await settle(p);
  log((await p.locator("table tbody tr td:nth-child(6)").first().innerText()).trim() === "–", "investor: per-asset yield is hidden");
  log(await p.getByText("Only asset managers can save scenarios.").isVisible(), "investor: save is explained, not hidden");
  await p.getByRole("spinbutton", { name: "Pound per US dollar" }).fill("55"); await p.waitForTimeout(1600);
  log(!/\b0\.0% vs base/.test(await central(p)), "investor can run scenarios");
  await p.locator("li", { hasText: "SC-002" }).first().getByRole("button", { name: "Reproduce" }).click();
  await p.locator("li", { hasText: "SC-002" }).first().getByText(/Reproduced exactly|portfolio data has changed/).waitFor();
  log(true, "investor can reproduce a saved scenario");
  await p.screenshot({ path: `${OUT}/en-scenarios-investor.png`, fullPage: true });
  // documents: flags yes, reader no
  await p.goto(`${BASE}/en/asset/documents`); await settle(p);
  log(await p.getByText("Reading a document shows rents").isVisible(), "investor: reader replaced by an explanation");
  log(await p.getByText(/Missing: 3/).first().isVisible(), "investor still sees the document flags");
  await c.close();

  // ======================= Documents: manager =======================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "manager1");
  await p.goto(`${BASE}/en/asset/documents`); await settle(p);
  log(await p.getByText("Missing: 3").first().isVisible() && await p.getByText("Expired: 2").first().isVisible() && await p.getByText("Pending: 2").first().isVisible(), "flags: 3 missing, 2 expired, 2 pending");
  log((await p.getByText(/Lease at .* ends/).count()) >= 6, "flags: leases ending within 120 days listed");
  await p.screenshot({ path: `${OUT}/en-documents-flags.png`, fullPage: true });

  // refusal of an unknown file
  await p.locator("#doc-file").setInputFiles("docs/stage-4/investor-pack-en.pdf");
  await p.getByText("This demo reads only its three bundled sample documents. That file is not one of them").waitFor();
  log(true, "an unknown PDF is refused plainly");
  // a real upload of a sample is recognised by hash
  await p.locator("#doc-file").setInputFiles("public/samples/sample-lease-en.pdf");
  await p.getByRole("heading", { name: /Read from sample-lease-en\.pdf/ }).waitFor();
  log(true, "dropping the real sample lease is recognised and read");
  const rentRow = p.locator("li", { hasText: "Monthly rent" }).first();
  log(await rentRow.getByText("Differs from the record").isVisible(), "rent differs from the record is flagged");
  log((await rentRow.locator("input").inputValue()) === "116000", "extracted rent 116000 shown");
  log(await rentRow.getByText(/Current record: .*114,000/).isVisible(), "current record 114,000 shown beside it");
  await rentRow.locator("details summary").click();
  log(await rentRow.getByText("Monthly rent: EGP 116,000").isVisible(), "source line is shown");
  await p.screenshot({ path: `${OUT}/en-documents-extraction.png`, fullPage: true });
  await p.getByRole("button", { name: "Confirm and update the record" }).click();
  await p.getByText(/Record updated\. 2 change\(s\)/).waitFor();
  log(true, "confirmation applies two changes");
  await p.goto(`${BASE}/en/asset/A-001`); await settle(p);
  log(await p.getByText(/EGP 116,000/).first().isVisible(), "asset A-001 now shows the confirmed rent");

  // bilingual lease: conflict needs a tick
  await p.goto(`${BASE}/en/asset/documents`); await settle(p);
  await p.getByRole("button", { name: /Lease, English and Arabic/ }).click();
  await p.getByRole("heading", { name: /Read from sample-lease-bilingual\.pdf/ }).waitFor();
  const conf = p.getByRole("button", { name: "Confirm and update the record" });
  log(await conf.isDisabled(), "conflicting field blocks confirmation until ticked");
  log(await p.getByText(/English says 8, Arabic says 9/).isVisible(), "English/Arabic conflict is shown");
  await p.locator("li", { hasText: "Annual indexation" }).first().getByRole("checkbox").check();
  log(await conf.isEnabled(), "ticking the field enables confirmation");
  await p.screenshot({ path: `${OUT}/en-documents-conflict.png`, fullPage: true });
  await conf.click();
  await p.getByText(/Record updated/).waitFor();
  log(true, "bilingual lease confirmed after the tick");

  // Arabic deed read as a file
  await p.locator("#doc-file").setInputFiles("public/samples/sample-deed-ar.pdf");
  await p.getByRole("heading", { name: /Read from sample-deed-ar\.pdf/ }).waitFor();
  log(await p.locator("li", { hasText: "Area (sqm)" }).first().locator("input").inputValue() === "612", "Arabic deed: area 612 read");
  await c.close();

  // ======================= Investor pack =======================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "manager1");
  await p.goto(`${BASE}/en/portfolio`); await settle(p);
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Download English PDF" }).click()]);
  const enPath = `${OUT}/dl-pack-en.pdf`; await dl.saveAs(enPath);
  log(fs.readFileSync(enPath).subarray(0, 4).toString() === "%PDF", `English pack downloaded (${dl.suggestedFilename()})`);
  const enText = execSync(`pdftotext -layout ${enPath} -`).toString();
  log(/Audit appendix/.test(enText) && /\d\/7/.test(enText), "English pack has the audit appendix");
  const hashes = enText.match(/\b[0-9a-f]{64}\b/g) || [];
  const verification = hashes[hashes.length - 1];
  log(!!verification, `verification hash found in the pack (${verification?.slice(0, 12)}…)`);
  const [dl2] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Download Arabic PDF" }).click()]);
  await dl2.saveAs(`${OUT}/dl-pack-ar.pdf`);
  const arText = execSync(`pdftotext -layout ${OUT}/dl-pack-ar.pdf -`).toString();
  log(/[؀-ۿ]{4}/.test(arText), "Arabic pack downloaded and contains Arabic text");
  await p.keyboard.press("Control+k");
  await p.getByPlaceholder("Search assets, districts, documents and actions").fill("investor pack");
  log((await p.getByRole("option", { name: /Generate investor pack/ }).count()) === 2, "command bar offers the pack in both languages");
  await p.keyboard.press("Escape");
  // verify on the governance page
  await p.goto(`${BASE}/en/governance`); await settle(p);
  await p.getByLabel("Verification hash").fill(verification);
  await p.getByRole("button", { name: "Verify" }).click();
  await p.getByText(/Issued as P-\d{4}/).waitFor();
  log(await p.getByText("The audit chain still contains the head this pack was bound to.").isVisible(), "verification hash verifies against the audit chain");
  await p.screenshot({ path: `${OUT}/en-governance-verify.png` });
  await p.getByLabel("Verification hash").fill("a".repeat(64));
  await p.getByRole("button", { name: "Verify" }).click();
  await p.getByText("No pack with that hash was issued by this system.").waitFor();
  log(true, "an unknown hash is reported as not issued");
  await c.close();

  // ======================= Admin =======================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await signIn(p, "en", "admin");
  await p.goto(`${BASE}/en/portfolio`); await settle(p);
  log(await p.getByText("Not available to this role").isVisible(), "admin: portfolio and pack buttons are not available");
  const r = await p.request.get(`${BASE}/api/pack?lang=en`);
  log(r.status() === 403, `admin: /api/pack returns 403 (${r.status()})`);
  await p.goto(`${BASE}/en/governance`); await settle(p);
  log(await p.getByRole("heading", { name: "Verify an investor pack" }).isVisible(), "admin can use the pack verifier");
  await c.close();
  ({ c, p } = await open({ width: 800, height: 600 }));
  const anon = await p.request.get(`${BASE}/api/pack?lang=en`);
  log(anon.status() === 401, `signed-out: /api/pack returns 401 (${anon.status()})`);
  await c.close();

  // ======================= Arabic + dark =======================
  ({ c, p } = await open({ width: 1360, height: 900 }, "dark"));
  await signIn(p, "ar", "manager1");
  await p.goto(`${BASE}/ar/portfolio/scenarios`); await settle(p);
  log((await p.getAttribute("html", "dir")) === "rtl", "AR scenarios dir=rtl");
  await p.getByRole("spinbutton", { name: "الجنيه مقابل الدولار" }).fill("60"); await p.waitForTimeout(1800);
  await p.screenshot({ path: `${OUT}/ar-scenarios-dark.png`, fullPage: true });
  log(await p.getByText("الحالة المركزية").first().isVisible(), "AR scenario results shown");
  await p.goto(`${BASE}/ar/asset/documents`); await settle(p);
  await p.getByRole("button", { name: /عقد ملكية بالعربية/ }).click();
  await p.getByRole("heading", { name: /قراءة من sample-deed-ar\.pdf/ }).waitFor();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/ar-documents-extraction-dark.png`, fullPage: true });
  log(true, "AR documents reader works");
  await p.goto(`${BASE}/ar/portfolio`); await settle(p);
  await p.screenshot({ path: `${OUT}/ar-portfolio-pack-dark.png` });
  await c.close();

  // ======================= Phone =======================
  for (const loc of ["en", "ar"]) {
    ({ c, p } = await open({ width: 390, height: 844 }, "light", 2));
    await signIn(p, loc, "manager1");
    await p.goto(`${BASE}/${loc}/portfolio/scenarios`); await settle(p); await noH(p, `${loc} scenarios @390`);
    await p.screenshot({ path: `${OUT}/${loc}-scenarios-phone.png`, fullPage: true });
    await p.goto(`${BASE}/${loc}/asset/documents`); await settle(p); await noH(p, `${loc} documents @390`);
    await p.getByRole("button", { name: loc === "en" ? /Lease, English and Arabic/ : /عقد إيجار بالإنجليزية والعربية/ }).click();
    await p.locator("ul li input").first().waitFor(); await p.waitForTimeout(700); await noH(p, `${loc} document extraction @390`);
    await p.screenshot({ path: `${OUT}/${loc}-documents-phone.png`, fullPage: true });
    await p.goto(`${BASE}/${loc}/portfolio`); await settle(p); await noH(p, `${loc} portfolio with pack buttons @390`);
    await p.goto(`${BASE}/${loc}/governance`); await settle(p); await noH(p, `${loc} governance verifier @390`);
    await c.close();
  }

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
