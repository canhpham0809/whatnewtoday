/**
 * testGold.ts – Script chạy thử riêng phần Gold (scrape + render)
 * Usage: npx tsx src/scripts/testGold.ts
 */
import dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";
import { scrapeGoldPrices } from "../modules/news/goldPrice";
import { renderGoldPriceSlides } from "../modules/render/renderNewsCard";
import { logger } from "../utils/logger";

async function main() {
  logger.info("=== TEST GOLD ONLY ===", "TEST-GOLD");

  // 1. Scrape gold prices
  logger.info("Step 1: Scraping gold prices...", "TEST-GOLD");
  const goldPrices = await scrapeGoldPrices();

  logger.info(`Scraped ${goldPrices.length} gold stores:`, "TEST-GOLD");
  for (const g of goldPrices) {
    if (g.storeEn === "world") {
      logger.info(`  [${g.store}] USD=${g.worldUSD} | VND=${g.worldVND} | Change=${g.worldChange}`, "TEST-GOLD");
    } else {
      logger.info(
        `  [${g.store}] Nhẫn=${g.nhaN?.buy}/${g.nhaN?.sell} | 999=${g.vang999?.buy}/${g.vang999?.sell} | 980=${g.vang998?.buy}/${g.vang998?.sell}`,
        "TEST-GOLD"
      );
    }
  }

  // 2. Render slides into output/test_gold
  const now = new Date();
  const dateOnly = now.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeOnly = now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const dateStr = `${dateOnly} - ${timeOnly}`; // dd/mm/yyyy - HH:MM
  const outputDir = path.resolve(process.cwd(), "output", "test_gold");

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  logger.info(`Step 2: Rendering slides to ${outputDir}...`, "TEST-GOLD");
  const slides = await renderGoldPriceSlides(goldPrices, outputDir, dateStr);

  logger.info(`=== DONE: ${slides.length} slide(s) saved to ${outputDir} ===`, "TEST-GOLD");
  slides.forEach((s) => logger.info(`  -> ${s}`, "TEST-GOLD"));
  process.exit(0);
}

main().catch((err) => {
  logger.error("testGold failed", err, "TEST-GOLD");
  process.exit(1);
});
