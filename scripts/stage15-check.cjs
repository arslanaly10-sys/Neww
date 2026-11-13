const fs = require("fs");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "docs/stage-15";
const results = [];
const log = (ok, msg) => { results.push({ ok, msg }); console.log(ok ? "PASS" : "FAIL", msg); };
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RAWKEY = /\b(settings|login|nav|ntf)\.[A-Za-z_]+\b(?!\.[a-z]{2,4}\b)/;

/** Stage 15: the brand sign-in, settings (profile, preferences, theme, access), and the administrator's users page. */
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

  // ================= Sign-in page, brand look =================
  let { c, p } = await open({ width: 1440, height: 900 }, "light");
  await p.goto(`${BASE}/en`); await settle(p, 2500);
  log(await p.getByRole("heading", { level: 1, name: "Value what you already own." }).isVisible(), "the sign-in headline reads as one sentence");
  log(await p.locator('img[src^="/brand/zmnhoof-eye"]').count() >= 2, "the ZMNHOOF eye is the logo and the hero");
  log(await p.locator("[data-theme=dark]").first().evaluate((e) => getComputedStyle(e).backgroundColor) === "rgb(9, 10, 12)", "the sign-in page wears the dark brand look even on a light device");
  log((await p.evaluate(() => getComputedStyle(document.querySelector("h1")).fontFamily)).includes("DM Serif Display"), "headings use the brand's DM Serif Display");
  await axe(p, "sign-in");
  await leak(p, "sign-in");
  await p.screenshot({ path: `${OUT}/en-signin.png` });
  await c.close();

  // ================= Admin: users =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await p.goto(`${BASE}/en`);
  await p.getByRole("button", { name: "Enter as Salma Rashed" }).click();
  await p.waitForURL("**/en/overview");
  await p.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Users" }).click();
  await p.waitForURL("**/en/users"); await settle(p);
  log((await p.title()) === "Users · ZMNHOOF OS", "Users page has its own title");
  await p.getByRole("button", { name: "Invite someone" }).click();
  const dlg = p.getByRole("dialog", { name: "Invite someone" });
  await dlg.getByLabel("Name", { exact: true }).fill("Sara Hamdy");
  await dlg.getByLabel("Email").fill("sara.hamdy@sample.test");
  await dlg.getByLabel("Role").selectOption("manager");
  await axe(p, "invite dialog");
  await dlg.getByRole("button", { name: "Send invitation" }).click();
  await p.getByText("Invitation sent to sara.hamdy@sample.test.").waitFor();
  const list = p.getByRole("list", { name: "Users" });
  log(await list.getByText("Sara Hamdy", { exact: true }).waitFor({ timeout: 8000 }).then(() => true, () => false), "an invited person joins the list");
  await p.getByLabel("Role of Omar Saleh").selectOption("investor");
  await p.getByText(/Omar Saleh's role changed \(audit #\d+\)/).waitFor();
  log(true, "the administrator changes a role, audited");
  await p.getByLabel("Role of Omar Saleh").selectOption("manager");
  await p.waitForTimeout(800);
  log(await p.getByLabel("Role of Salma Rashed").isDisabled(), "you cannot change your own role");
  const karim = list.getByRole("listitem").filter({ hasText: "Karim Fahmy" });
  await karim.getByRole("button", { name: "Deactivate" }).click();
  await karim.getByRole("button", { name: "Yes, deactivate" }).click();
  await p.getByText(/Karim Fahmy deactivated/).waitFor();
  log(true, "deactivating needs a confirmation");
  await axe(p, "users page");
  await leak(p, "users page");
  await p.screenshot({ path: `${OUT}/en-users.png`, fullPage: true });
  await c.close();

  // A deactivated person is gone from sign-in; the invited one is there.
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await p.goto(`${BASE}/en`); await settle(p);
  log(await p.getByRole("button", { name: "Enter as Karim Fahmy" }).count() === 0, "a deactivated account cannot sign in");
  await p.getByRole("button", { name: /Enter as Sara Hamdy/ }).click();
  await p.waitForURL("**/en/overview");
  log(true, "an invited person signs in, which activates them");
  await c.close();
  // Bring Karim back for the checks that follow.
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await p.goto(`${BASE}/en`);
  await p.getByRole("button", { name: "Enter as Salma Rashed" }).click(); await p.waitForURL("**/en/overview");
  await p.goto(`${BASE}/en/users`); await settle(p);
  await p.getByRole("list", { name: "Users" }).getByRole("listitem").filter({ hasText: "Karim Fahmy" }).getByRole("button", { name: "Reactivate" }).click();
  await p.getByText(/Karim Fahmy reactivated/).waitFor();
  log(true, "an account can be reactivated");
  await c.close();

  // ================= Manager: settings =================
  ({ c, p } = await open({ width: 1360, height: 900 }));
  await p.goto(`${BASE}/en`);
  await p.getByRole("button", { name: "Enter as Nour Abdelrahman" }).click(); await p.waitForURL("**/en/overview");
  await p.getByRole("navigation", { name: "Main navigation" }).first().getByRole("link", { name: "Settings" }).click();
  await p.waitForURL("**/en/settings"); await settle(p);
  await p.getByLabel("Job title", { exact: true }).fill("Head of Asset Management");
  await p.getByRole("button", { name: "Save profile" }).click();
  await p.getByText("Profile saved.").waitFor();
  log(true, "you change your own profile");
  await p.getByRole("tab", { name: "Preferences" }).click();
  await p.getByRole("radio", { name: /Dark/ }).click();
  log(await p.evaluate(() => document.documentElement.dataset.theme) === "dark", "choosing dark applies at once");
  await p.getByLabel("First page after signing in").selectOption("deals");
  await p.getByRole("button", { name: "Save preferences" }).click();
  await p.getByText("Preferences saved.").waitFor();
  await p.reload(); await settle(p);
  log(await p.evaluate(() => document.documentElement.dataset.theme) === "dark", "the theme is remembered");
  await axe(p, "settings, dark");
  await p.screenshot({ path: `${OUT}/en-settings-dark.png`, fullPage: true });
  await p.getByRole("tab", { name: "Your access" }).click();
  log(await p.getByText("Confirm a valuation proposed by someone else").or(p.getByText(/Confirm/)).first().isVisible(), "your access lists what your role can do");
  // Sign out and in again: the chosen first page.
  await c.clearCookies();
  await p.goto(`${BASE}/en`);
  await p.getByRole("button", { name: "Enter as Nour Abdelrahman" }).click();
  await p.waitForURL("**/en/deals");
  log(true, "signing in lands on the chosen first page");
  // Put things back for later checks.
  await p.goto(`${BASE}/en/settings#preferences`); await settle(p);
  await p.getByRole("radio", { name: /Match the device/ }).click();
  await p.getByLabel("First page after signing in").selectOption("overview");
  await p.getByRole("button", { name: "Save preferences" }).click();
  await p.getByText("Preferences saved.").waitFor();
  await c.close();

  // ================= Arabic phone =================
  ({ c, p } = await open({ width: 390, height: 844 }));
  await p.goto(`${BASE}/ar`); await settle(p, 2500);
  await noH(p, "ar sign-in @390");
  await axe(p, "ar sign-in phone");
  await p.screenshot({ path: `${OUT}/ar-signin-phone.png` });
  await p.getByRole("button", { name: "الدخول بصفة كريم فهمي" }).click(); await p.waitForURL("**/ar/overview");
  await p.goto(`${BASE}/ar/settings`); await settle(p);
  await noH(p, "ar settings @390");
  await leak(p, "ar settings");
  await c.close();

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  const real = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels/.test(e));
  console.log("console errors:", real.length); real.slice(0, 10).forEach((e) => console.log("  ", e));
  process.exit(fails.length || real.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
