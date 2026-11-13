const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/showcase";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

/** Motion visuals: the scattered arc and record sphere on the sign-in page, and the overview's Motion charts. */
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const errors = [];
  const open = async (viewport, scheme = "light", reduced = "no-preference") => {
    const c = await browser.newContext({ viewport, colorScheme: scheme, reducedMotion: reduced });
    const p = await c.newPage();
    p.on("console", (m) => { if (m.type() === "error") errors.push(`${p.url()} ${m.text()}`); });
    p.on("pageerror", (e) => errors.push(`${p.url()} pageerror ${e.message}`));
    return { c, p };
  };
  const axe = async (p, name) => { await p.evaluate(axeSrc); const r = await p.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })); log(r.violations.length === 0, `axe: ${name} (${r.violations.map((v) => `${v.id}:${v.nodes.length}`).join(", ") || "0 violations"})`); };
  const noH = async (p, name) => { const [a, b] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); log(a <= b, `no horizontal scroll: ${name} (${a}/${b})`); };

  // ===== Sign-in page, desktop, dark =====
  let { c, p } = await open({ width: 1360, height: 900 }, "dark");
  await p.goto(`${BASE}/en`); await p.waitForLoadState("load");
  const arc = p.locator('section[aria-labelledby="sa-h"]');
  await arc.scrollIntoViewIfNeeded(); await p.waitForTimeout(2200);
  const label = p.locator('svg [role="button"][aria-label="Bank statements"]');
  await label.locator("text").click();
  await arc.getByRole("region", { name: "Bank statements" }).getByText(/arrears show by age/).waitFor();
  log(await label.getAttribute("aria-pressed") === "true", "choosing a source on the arc opens what ZMNHOOF does with it");
  await arc.getByRole("button", { name: "Close" }).click();
  await arc.getByRole("heading", { name: "Your portfolio is scattered" }).waitFor();
  await p.locator('svg [role="button"][aria-label="Title deeds"]').focus();
  await p.keyboard.press("Enter");
  await arc.getByRole("region", { name: "Title deeds" }).waitFor();
  log(true, "the arc works from the keyboard");
  await axe(p, "arc with a source open");
  await arc.screenshot({ path: `${OUT}/motion-arc-open.png` });

  const sph = p.locator('section[aria-labelledby="rs-h"]');
  await sph.scrollIntoViewIfNeeded(); await p.waitForTimeout(2200);
  await sph.getByRole("button", { name: /Horus, with citations/ }).click();
  const detail = sph.getByRole("region", { name: "Horus, with citations" });
  await detail.getByText(/never invents figures/).waitFor();
  log(await sph.getByRole("button", { name: /Horus, with citations/ }).getAttribute("aria-expanded") === "true", "choosing a capability opens it in the sphere");
  log(await sph.locator("svg path.stroke-gold-fill").count() >= 1, "a flow line joins the chosen line to the sphere");
  await detail.getByRole("link", { name: "Sign in to try it" }).click();
  await p.waitForTimeout(800);
  log(await p.evaluate(() => { const r = document.getElementById("signin").getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }), "\"Sign in to try it\" brings the sign-in cards into view");
  await axe(p, "sphere with a capability open");
  await sph.screenshot({ path: `${OUT}/motion-sphere-open.png` });

  // ===== Overview charts =====
  await p.getByRole("button", { name: "Enter as Nour Abdelrahman" }).click();
  await p.waitForURL("**/en/overview");
  const mg = p.locator('section[aria-labelledby="mg-h"]');
  await mg.scrollIntoViewIfNeeded(); await p.waitForTimeout(2000);
  await mg.getByRole("button", { name: /^Vacant/ }).click();
  const vacant = mg.getByRole("list", { name: "Vacant" });
  await vacant.waitFor();
  const n = await vacant.getByRole("link").count();
  log(n > 0, `the occupancy ring lists the vacant assets (${n})`);
  const first = await mg.getByRole("list", { name: "Largest holdings" }).getByRole("link").first().innerText();
  await mg.getByRole("radio", { name: "Gain" }).click(); await p.waitForTimeout(900);
  const firstGain = await mg.getByRole("list", { name: "Largest holdings" }).getByRole("link").first().innerText();
  log(first !== firstGain, "sorting holdings by gain re-orders the bars");
  const slider = mg.getByRole("slider");
  await slider.focus(); await p.keyboard.press("Home");
  const startText = await slider.getAttribute("aria-valuetext");
  await p.keyboard.press("End");
  log(startText !== await slider.getAttribute("aria-valuetext"), "the value line scrubs with the keyboard");
  await axe(p, "overview motion charts");
  await mg.screenshot({ path: `${OUT}/motion-overview.png` });
  await vacant.getByRole("link").first().click();
  await p.waitForURL(/\/en\/asset\/A-\d{3}/);
  log(true, "a ring entry opens its asset");
  await c.close();

  // ===== Phone, Arabic, reduced motion =====
  ({ c, p } = await open({ width: 390, height: 844 }, "light", "reduce"));
  await p.goto(`${BASE}/ar`); await p.waitForLoadState("load"); await p.waitForTimeout(1200);
  await noH(p, "ar sign-in @390");
  await p.getByRole("list", { name: "أين تعيش سجلات المحفظة اليوم" }).getByRole("button", { name: "مجموعات واتساب" }).click();
  await p.getByRole("region", { name: "مجموعات واتساب" }).waitFor();
  await p.waitForTimeout(600); // let the card finish fading in before measuring contrast
  log(true, "phones open a source from the list");
  await axe(p, "ar sign-in phone, reduced motion");
  await p.locator('section[aria-labelledby="rs-h"]').screenshot({ path: `${OUT}/motion-sphere-phone-ar.png` });
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
