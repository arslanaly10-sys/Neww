const { chromium } = require("playwright");
const fs = require("fs");
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = process.env.BASE || "http://localhost:3100";
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  let total = 0;
  for (const scheme of ["light", "dark"]) for (const loc of ["en", "ar"]) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    const p = await c.newPage();
    await p.goto(`${BASE}/${loc}`);
    const scan = async (name) => {
      await p.waitForTimeout(500);
      await p.evaluate(axeSrc);
      const r = await p.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] }));
      for (const v of r.violations) { total++; console.log(`[${scheme}/${loc}] ${name}: ${v.id} (${v.impact}) x${v.nodes.length} :: ${v.nodes[0].target.join(" ")} :: ${(v.nodes[0].any[0]?.message || "").slice(0, 110)}`); }
    };
    await scan("login");
    const names = { en: "Enter as Nour Abdelrahman", ar: "الدخول بصفة نور عبد الرحمن" };
    await p.getByRole("button", { name: loc === "en" ? "Enter as Nour Abdelrahman" : "الدخول بصفة نور عبد الرحمن" }).click();
    await p.waitForURL(`**/${loc}/overview`);
    for (const a of ["overview", "overview/alerts", "portfolio", "portfolio/scenarios", "asset", "asset/A-004", "asset/documents", "valuation", "market", "governance"]) { await p.goto(`${BASE}/${loc}/${a}`); await scan(a); }
    // interactive states
    await p.goto(`${BASE}/${loc}/asset/documents`);
    await p.getByRole("button", { name: loc === "en" ? /Lease, English and Arabic/ : /عقد إيجار بالإنجليزية والعربية/ }).click(); await p.locator("ul li input").first().waitFor(); await p.waitForTimeout(800); await scan("document extraction form");
    await p.goto(`${BASE}/${loc}/portfolio/scenarios`); await p.waitForTimeout(800);
    await p.getByRole("spinbutton", { name: loc === "en" ? "Pound per US dollar" : "الجنيه مقابل الدولار" }).fill("62"); await p.waitForTimeout(1800); await scan("scenarios after a change");
    await p.goto(`${BASE}/${loc}/valuation?asset=A-001`);
    await p.getByRole("button", { name: loc === "en" ? "Run valuation" : "إجراء التقييم" }).click(); await p.waitForTimeout(1200); await scan("valuation with result");
    await p.getByRole("button", { name: loc === "en" ? "Ask Horus" : "اسأل حورس" }).first().click(); await p.waitForTimeout(500); await scan("Horus panel (empty)");
    await p.locator("#horus-q").fill(loc === "en" ? "Which assets are vacant?" : "ما الأصول الشاغرة؟"); await p.keyboard.press("Enter");
    await p.locator("article button[aria-label]").first().waitFor({ timeout: 15000 }); await p.waitForTimeout(500); await scan("Horus panel with answer");
    await p.locator("article button[aria-label]").first().click(); await p.waitForTimeout(800); await scan("citation dialog");
    await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
    await p.goto(`${BASE}/${loc}/overview`); await p.waitForTimeout(500);
    await p.keyboard.press("Control+k"); await p.waitForTimeout(500); await scan("command bar");
    await p.keyboard.press("Escape");
    await p.locator("main button[aria-label*=':']").first().click(); await p.waitForTimeout(500); await scan("number popover");
    await c.close();
    // administrator: audit log, verify, and the broken-chain state
    const ac = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    const ap = await ac.newPage();
    await ap.goto(`${BASE}/${loc}`);
    await ap.getByRole("button", { name: loc === "en" ? "Enter as Salma Rashed" : "الدخول بصفة سلمى راشد" }).click();
    await ap.waitForURL(`**/${loc}/overview`);
    const scanA = async (name) => {
      await ap.waitForTimeout(600);
      await ap.evaluate(axeSrc);
      const r = await ap.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] }));
      for (const v of r.violations) { total++; console.log(`[${scheme}/${loc}] ADMIN ${name}: ${v.id} (${v.impact}) x${v.nodes.length} :: ${v.nodes[0].target.join(" ")} :: ${(v.nodes[0].any[0]?.message || "").slice(0, 110)}`); }
    };
    await ap.goto(`${BASE}/${loc}/overview`); await scanA("overview");
    await ap.goto(`${BASE}/${loc}/overview/alerts`); await scanA("alerts and approvals");
    await ap.goto(`${BASE}/${loc}/governance`); await scanA("governance with audit log");
    await ap.getByRole("button", { name: loc === "en" ? "Verify chain" : "تحقق من السلسلة" }).click(); await ap.waitForTimeout(1500); await scanA("verify passed");
    await ap.getByRole("button", { name: loc === "en" ? "Tamper with an event (demo)" : "تعديل حدث (عرض تجريبي)" }).click(); await ap.waitForTimeout(1200);
    await ap.getByRole("button", { name: loc === "en" ? "Verify chain" : "تحقق من السلسلة" }).click(); await ap.waitForTimeout(1500); await scanA("verify failed");
    await ap.getByRole("button", { name: loc === "en" ? "Restore the event (demo)" : "استعادة الحدث (عرض تجريبي)" }).click(); await ap.waitForTimeout(1200);
    await ac.close();
  }
  await browser.close();
  console.log(`axe violations: ${total}`);
})();
