const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--allow-file-access-from-files"] });
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto("file:///tmp/claude-0/og.html"); await p.waitForTimeout(600);
  await p.screenshot({ path: "public/og.png" });
  await b.close();
})();
