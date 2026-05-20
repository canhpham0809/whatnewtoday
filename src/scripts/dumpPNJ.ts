/**
 * dumpPNJ.ts – Dump raw HTML table of PNJ page after JS render
 * Usage: npx tsx src/scripts/dumpPNJ.ts
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
  });

  console.log("Navigating to webgia.com/gia-vang/pnj/ ...");
  await page.goto("https://webgia.com/gia-vang/pnj/", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(3000);

  // Dump ALL table row texts so we can see what labels are actually there
  const rows = await page.evaluate(() => {
    const result: { cellCount: number; cells: string[] }[] = [];
    const allRows = document.querySelectorAll("table tr");
    for (const r of Array.from(allRows)) {
      const tds = r.querySelectorAll("td, th");
      if (tds.length > 0) {
        result.push({
          cellCount: tds.length,
          cells: Array.from(tds).map((td) => td.textContent?.trim() || "")
        });
      }
    }
    return result;
  });

  console.log("\n=== PNJ TABLE ROWS (after JS render) ===");
  rows.forEach((r, i) => {
    console.log(`Row ${i + 1} [${r.cellCount} cells]: ${JSON.stringify(r.cells)}`);
  });

  // Also dump full HTML for inspection
  const html = await page.content();
  const outPath = path.resolve(process.cwd(), "output", "pnj_debug.html");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, "utf-8");
  console.log(`\nFull HTML saved to: ${outPath}`);

  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("dumpPNJ failed:", err);
  process.exit(1);
});
