import { chromium } from "playwright";
import { logger } from "../../utils/logger";
import fs from "fs";
import path from "path";
import { fetchRssFeeds } from "../rss/fetchRss";
import { normalizeRawNews } from "../rss/normalizeNews";
import { NewsArticle } from "../database/repositories";

export interface GoldStorePrice {
  store: string;
  storeEn: string;
  nhaN?: { buy: string; sell: string; changeBuy?: string; changeSell?: string };
  vang998?: { buy: string; sell: string; changeBuy?: string; changeSell?: string };
  vang999?: { buy: string; sell: string; changeBuy?: string; changeSell?: string };
  // For world gold (XAU/USD)
  worldUSD?: string;
  worldVND?: string;
  worldRateBuy?: string; // VND per USD (mua vào)
  worldRateSell?: string; // VND per USD (bán ra)
  worldVNDBuy?: string;
  worldVNDSell?: string;
  worldRateChangeBuy?: string;
  worldRateChangeSell?: string;
  worldChange?: string;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); } catch (err) { if (i === retries - 1) throw err; await new Promise(r => setTimeout(r, delay)); }
  }
  return fn();
}

function calculateChange(current: string, previous: string | undefined, isFloat = false): string {
  if (!current || current === "N/A" || !previous || previous === "N/A") return "";
  const curStr = current.replace(/[$,]/g, "");
  const prevStr = previous.replace(/[$,]/g, "");
  const curVal = isFloat ? parseFloat(curStr) : parseInt(curStr, 10);
  const prevVal = isFloat ? parseFloat(prevStr) : parseInt(prevStr, 10);
  if (isNaN(curVal) || isNaN(prevVal)) return "";
  const diff = curVal - prevVal;
  if (diff === 0) return "-";
  const prefix = diff > 0 ? "+" : "";
  const formatDiff = isFloat ? diff.toFixed(2) : diff.toLocaleString("en-US");
  return `${prefix}${formatDiff}`;
}

/**
 * Clean and format price strings to 'XX,XXX' standard layout representation.
 * (e.g. '15.850.000' or '15850000' -> '15,850')
 */
function formatPrice(val: string): string {
  if (!val || val === "N/A" || val === "-") return "N/A";
  
  // Strip non-digits
  const clean = val.replace(/\D/g, "");
  if (!clean) return "N/A";
  
  const num = parseInt(clean, 10);
  
  // If in VNĐ/lượng, divide by 1000 to display in 1000đ/chỉ
  if (num > 1000000) {
    const divided = Math.floor(num / 1000);
    return divided.toLocaleString("en-US");
  }
  return num.toLocaleString("en-US");
}

/**
 * Scrapes live gold prices from webgia.com (reliable, no Cloudflare blocks) using Playwright.
 */
export async function scrapeGoldPrices(): Promise<GoldStorePrice[]> {
  logger.info("Starting gold price scraping from webgia.com...", "GOLD-PRICE");

  const results: GoldStorePrice[] = [];
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    
    // Block images, styles, and fonts to prevent crashes and speed up loading
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "stylesheet", "font", "media"].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    });

    // ─── 1. VÀNG THẾ GIỚI ────────────────────────────────────────────────────
    let worldGoldAdded = false;
    try {
      await withRetry(async () => {
        logger.info("Scraping Vàng Thế Giới price (primary: webgia.com)...", "GOLD-PRICE");
        await page.goto("https://webgia.com/gia-vang/", { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(2000);

        const worldUSD = await page.evaluate(() => {
          const tables = document.querySelectorAll("table");
          for (const t of Array.from(tables)) {
            const text = t.textContent || "";
            if (text.includes("thế giới") || text.includes("$")) {
              const tds = t.querySelectorAll("td, th");
              for (const td of Array.from(tds)) {
                const val = td.textContent?.trim() || "";
                if (val.includes("$")) {
                  const match = val.match(/\$[\d,\.]+/);
                  if (match) return match[0];
                }
              }
            }
          }
          return "N/A";
        });

        // Use fixed VND/USD buy/sell rates for conversion (user-specified)
        const vndUsdBuy = 26121; // USD mua vào (VND per USD)
        const vndUsdSell = 26391; // USD bán ra (VND per USD)

        const worldRateBuy = vndUsdBuy.toLocaleString('en-US');
        const worldRateSell = vndUsdSell.toLocaleString('en-US');

        const worldVNDBuy = worldUSD !== "N/A"
          ? Math.round(parseFloat(worldUSD.replace(/[$,]/g, "")) * vndUsdBuy).toLocaleString("en-US")
          : "N/A";

        const worldVNDSell = worldUSD !== "N/A"
          ? Math.round(parseFloat(worldUSD.replace(/[$,]/g, "")) * vndUsdSell).toLocaleString("en-US")
          : "N/A";

        // Keep legacy single field for backward compatibility (use buy-side as default)
        const worldVND = worldVNDBuy;

        results.push({
          store: "Vàng Thế Giới",
          storeEn: "world",
          worldUSD,
          worldVND,
          worldRateBuy,
          worldRateSell,
          worldChange: ""
        });
        worldGoldAdded = true;
        logger.success(`Vàng Thế Giới: ${worldUSD} (${worldVND} VND)`, "GOLD-PRICE");
      }, 3, 1000);
    } catch (primaryErr) {
      logger.warn("Primary source failed, trying goldprice.org...", "GOLD-PRICE");
      try {
        await withRetry(async () => {
          await page.goto("https://goldprice.org/", { waitUntil: "domcontentloaded", timeout: 20000 });
          await page.waitForTimeout(2000);
          const usd = await page.evaluate(() => {
            const el = document.querySelector("#price_usd");
            return el ? (el.textContent?.trim() || "N/A") : "N/A";
          });
          const worldUSD = usd !== "N/A" ? `$${usd}` : "N/A";
          // Use fixed VND/USD buy/sell rates for conversion (user-specified)
          const vndUsdBuy = 26121;
          const vndUsdSell = 26391;
          const worldRateBuy = vndUsdBuy.toLocaleString('en-US');
          const worldRateSell = vndUsdSell.toLocaleString('en-US');
          const worldVNDBuy = worldUSD !== "N/A"
            ? Math.round(parseFloat(worldUSD.replace(/[$,]/g, "")) * vndUsdBuy).toLocaleString("en-US")
            : "N/A";
          const worldVNDSell = worldUSD !== "N/A"
            ? Math.round(parseFloat(worldUSD.replace(/[$,]/g, "")) * vndUsdSell).toLocaleString("en-US")
            : "N/A";
          const worldVND = worldVNDBuy;
        results.push({ store: "Vàng Thế Giới", storeEn: "world", worldUSD, worldVND, worldRateBuy, worldRateSell, worldVNDBuy, worldVNDSell, worldChange: "" });
          worldGoldAdded = true;
          logger.success(`Vàng Thế Giới (fallback): ${worldUSD}`, "GOLD-PRICE");
        }, 2, 1500);
      } catch (secondaryErr) {
        logger.error("Both sources failed for Vàng Thế Giới.", secondaryErr, "GOLD-PRICE");
      }
    }
    if (!worldGoldAdded) {
      results.push({ store: "Vàng Thế Giới", storeEn: "world", worldUSD: "N/A", worldVND: "N/A" });
    }


    // ─── 2. VÀNG SJC ────────────────────────────────────────────────────────
    try {
      logger.info("Scraping Vàng SJC price...", "GOLD-PRICE");
      await page.goto("https://webgia.com/gia-vang/sjc/", {
        waitUntil: "domcontentloaded",
        timeout: 20000
      });
      await page.waitForTimeout(2000);

      const sjcData = await page.evaluate(() => {
        const rows = document.querySelectorAll("table tr");
        const res = {
          nhaN: { buy: "N/A", sell: "N/A" },
          vang998: { buy: "N/A", sell: "N/A" },
          vang999: { buy: "N/A", sell: "N/A" }
        };
        for (const r of Array.from(rows)) {
          const cells = r.querySelectorAll("td, th");
          let label = "";
          let buy = "";
          let sell = "";

          if (cells.length === 4) {
            label = cells[1]?.textContent?.trim().toLowerCase() || "";
            buy = cells[2]?.textContent?.trim() || "";
            sell = cells[3]?.textContent?.trim() || "";
          } else if (cells.length === 3) {
            label = cells[0]?.textContent?.trim().toLowerCase() || "";
            buy = cells[1]?.textContent?.trim() || "";
            sell = cells[2]?.textContent?.trim() || "";
          } else {
            continue;
          }
          
          if (label.includes("nhẫn sjc 99") || label.includes("vàng nhẫn sjc")) {
            res.nhaN = { buy, sell };
          } else if (label.includes("nữ trang 99%") || label.includes("99%")) {
            res.vang998 = { buy, sell };
          } else if (label.includes("vàng sjc 1l") || label.includes("sjc 1l")) {
            res.vang999 = { buy, sell };
          }
        }
        return res;
      });

      results.push({
        store: "Vàng SJC",
        storeEn: "sjc",
        nhaN: { buy: formatPrice(sjcData.nhaN.buy), sell: formatPrice(sjcData.nhaN.sell) },
        vang998: { buy: formatPrice(sjcData.vang998.buy), sell: formatPrice(sjcData.vang998.sell) },
        vang999: { buy: formatPrice(sjcData.vang999.buy), sell: formatPrice(sjcData.vang999.sell) }
      });
      logger.success("Vàng SJC parsed successfully.", "GOLD-PRICE");
    } catch (err) {
      logger.error("Failed to scrape Vàng SJC.", err, "GOLD-PRICE");
      results.push({
        store: "Vàng SJC",
        storeEn: "sjc",
        nhaN: { buy: "N/A", sell: "N/A" },
        vang998: { buy: "N/A", sell: "N/A" },
        vang999: { buy: "N/A", sell: "N/A" }
      });
    }

    // ─── 3. VÀNG PNJ ────────────────────────────────────────────────────────
    try {
      logger.info("Scraping Vàng PNJ price...", "GOLD-PRICE");
      await page.goto("https://webgia.com/gia-vang/pnj/", {
        waitUntil: "domcontentloaded",
        timeout: 20000
      });
      await page.waitForTimeout(2000);

      const pnjData = await page.evaluate(() => {
        const rows = document.querySelectorAll("table tr");
        const res = {
          nhaN: { buy: "N/A", sell: "N/A" },
          vang998: { buy: "N/A", sell: "N/A" },
          vang999: { buy: "N/A", sell: "N/A" }
        };
        for (const r of Array.from(rows)) {
          const cells = r.querySelectorAll("td, th");
          let label = "";
          let buy = "";
          let sell = "";

          if (cells.length === 4) {
            label = cells[1]?.textContent?.trim().toLowerCase() || "";
            buy = cells[2]?.textContent?.trim() || "";
            sell = cells[3]?.textContent?.trim() || "";
          } else if (cells.length === 3) {
            label = cells[0]?.textContent?.trim().toLowerCase() || "";
            buy = cells[1]?.textContent?.trim() || "";
            sell = cells[2]?.textContent?.trim() || "";
          } else {
            continue;
          }
          
          // ── PNJ label mapping (from live page dump 2026-05-20) ──────────────
          // Row 14: [4 cells] "Giá vàng nữ trang" | "Nhẫn Trơn PNJ 999.9" | buy | sell
          // Row 17: [3 cells] "Vàng nữ trang 999.9" | buy | sell   → 999 (24k)
          // Row 18: [3 cells] "Vàng nữ trang 999"   | buy | sell   → also 999
          // Row 20: [3 cells] "Vàng nữ trang 99"    | buy | sell   → 980 (~23.5k)
          // Row 30: [4 cells] "Giá vàng nguyên liệu" | "99.99" | buy | "-"  ← SKIP (nguyên liệu)
          // ─────────────────────────────────────────────────────────────────────

          // Skip "nguyên liệu" section rows entirely (they have sell = "-")
          const isMaterial = cells[0]?.textContent?.toLowerCase().includes("nguyên liệu") ||
                             (cells.length === 4 && (cells[3]?.textContent?.trim() === "-" || cells[3]?.textContent?.trim() === ""));

          if (isMaterial) continue;

          if (label === "pnj" || label === "sjc") {
            if (res.vang999.buy === "N/A") res.vang999 = { buy, sell };
          } else if (
            label.includes("nhẫn trơn pnj") ||
            label.includes("nhẫn pnj")
          ) {
            if (res.nhaN.buy === "N/A") res.nhaN = { buy, sell };
          } else if (
            label === "vàng nữ trang 99" ||
            label.includes("nữ trang 99%") ||
            label.includes("9920") ||
            (label.includes("nữ trang") && label.endsWith("99"))
          ) {
            // ~980 / 23.5k  – "vàng nữ trang 99" or "9920"
            if (res.vang998.buy === "N/A") res.vang998 = { buy, sell };
          } else if (
            label.includes("nữ trang 999.9") ||
            label === "vàng nữ trang 999" ||
            label.includes("nữ trang 999")
          ) {
            // 999 / 24k – prefer "999.9" first
            if (res.vang999.buy === "N/A") res.vang999 = { buy, sell };
          }
        }
        return res;

      });

      results.push({
        store: "Vàng PNJ",
        storeEn: "pnj",
        nhaN: { buy: formatPrice(pnjData.nhaN.buy), sell: formatPrice(pnjData.nhaN.sell) },
        vang998: { buy: formatPrice(pnjData.vang998.buy), sell: formatPrice(pnjData.vang998.sell) },
        vang999: { buy: formatPrice(pnjData.vang999.buy), sell: formatPrice(pnjData.vang999.sell) }
      });
      logger.success("Vàng PNJ parsed successfully.", "GOLD-PRICE");
    } catch (err) {
      logger.error("Failed to scrape Vàng PNJ.", err, "GOLD-PRICE");
      results.push({
        store: "Vàng PNJ",
        storeEn: "pnj",
        nhaN: { buy: "N/A", sell: "N/A" },
        vang998: { buy: "N/A", sell: "N/A" },
        vang999: { buy: "N/A", sell: "N/A" }
      });
    }

    // ─── 4. VÀNG BẢO TÍN MINH CHÂU ──────────────────────────────────────────
    try {
      logger.info("Scraping Vàng Bảo Tín Minh Châu price...", "GOLD-PRICE");
      await page.goto("https://webgia.com/gia-vang/bao-tin-minh-chau/", {
        waitUntil: "domcontentloaded",
        timeout: 20000
      });
      await page.waitForTimeout(2000);

      const btmcData = await page.evaluate(() => {
        const rows = document.querySelectorAll("table tr");
        const res = {
          nhaN: { buy: "N/A", sell: "N/A" },
          vang998: { buy: "N/A", sell: "N/A" },
          vang999: { buy: "N/A", sell: "N/A" }
        };
        for (const r of Array.from(rows)) {
          const cells = r.querySelectorAll("td, th");
          let label = "";
          let buy = "";
          let sell = "";

          if (cells.length === 4) {
            label = cells[1]?.textContent?.trim().toLowerCase() || "";
            buy = cells[2]?.textContent?.trim() || "";
            sell = cells[3]?.textContent?.trim() || "";
          } else if (cells.length === 3) {
            label = cells[0]?.textContent?.trim().toLowerCase() || "";
            buy = cells[1]?.textContent?.trim() || "";
            sell = cells[2]?.textContent?.trim() || "";
          } else {
            continue;
          }
          
          if (label.includes("nhẫn tròn trơn")) {
            if (res.nhaN.buy === "N/A") res.nhaN = { buy, sell };
          } else if (label.includes("vàng rồng thăng long 99.9") && !label.includes("999.9")) {
            if (res.vang998.buy === "N/A") res.vang998 = { buy, sell };
          } else if (label.includes("vàng miếng 999.9") || label.includes("vàng rồng thăng long 999.9") || label.includes("vàng 999.9")) {
            if (res.vang999.buy === "N/A") res.vang999 = { buy, sell };
          }
        }
        return res;
      });

      results.push({
        store: "Bảo Tín Minh Châu",
        storeEn: "btmc",
        nhaN: { buy: formatPrice(btmcData.nhaN.buy), sell: formatPrice(btmcData.nhaN.sell) },
        vang998: { buy: formatPrice(btmcData.vang998.buy), sell: formatPrice(btmcData.vang998.sell) },
        vang999: { buy: formatPrice(btmcData.vang999.buy), sell: formatPrice(btmcData.vang999.sell) }
      });
      logger.success("Vàng Bảo Tín Minh Châu parsed successfully.", "GOLD-PRICE");
    } catch (err) {
      logger.error("Failed to scrape Vàng Bảo Tín Minh Châu.", err, "GOLD-PRICE");
      results.push({
        store: "Bảo Tín Minh Châu",
        storeEn: "btmc",
        nhaN: { buy: "N/A", sell: "N/A" },
        vang998: { buy: "N/A", sell: "N/A" },
        vang999: { buy: "N/A", sell: "N/A" }
      });
    }

    // ─── 5. VÀNG MI HỒNG ────────────────────────────────────────────────────
    try {
      logger.info("Scraping Vàng Mi Hồng price...", "GOLD-PRICE");
      await page.goto("https://webgia.com/gia-vang/mi-hong/", {
        waitUntil: "domcontentloaded",
        timeout: 20000
      });
      await page.waitForTimeout(2000);

      const mihongData = await page.evaluate(() => {
        const rows = document.querySelectorAll("table tr");
        const res = {
          nhaN: { buy: "N/A", sell: "N/A" },
          vang998: { buy: "N/A", sell: "N/A" },
          vang999: { buy: "N/A", sell: "N/A" }
        };
        for (const r of Array.from(rows)) {
          const cells = r.querySelectorAll("td, th");
          let label = "";
          let buy = "";
          let sell = "";

          if (cells.length === 4) {
            label = cells[1]?.textContent?.trim().toLowerCase() || "";
            buy = cells[2]?.textContent?.trim() || "";
            sell = cells[3]?.textContent?.trim() || "";
          } else if (cells.length === 3) {
            label = cells[0]?.textContent?.trim().toLowerCase() || "";
            buy = cells[1]?.textContent?.trim() || "";
            sell = cells[2]?.textContent?.trim() || "";
          } else {
            continue;
          }
          
          if (label === "mi hồng" || label === "sjc") {
            if (res.vang999.buy === "N/A") res.vang999 = { buy, sell };
          } else if (label.includes("vàng 99,9%") || label.includes("vàng 999")) {
            if (res.nhaN.buy === "N/A") res.nhaN = { buy, sell };
          } else if (label.includes("9t8") || label.includes("vàng 98")) {
            if (res.vang998.buy === "N/A") res.vang998 = { buy, sell };
          } else if (label.includes("sjc")) {
            if (res.vang999.buy === "N/A") res.vang999 = { buy, sell };
          }
        }
        return res;
      });

      results.push({
        store: "Vàng Mi Hồng",
        storeEn: "mihong",
        nhaN: { buy: formatPrice(mihongData.nhaN.buy), sell: formatPrice(mihongData.nhaN.sell) },
        vang998: { buy: formatPrice(mihongData.vang998.buy), sell: formatPrice(mihongData.vang998.sell) },
        vang999: { buy: formatPrice(mihongData.vang999.buy), sell: formatPrice(mihongData.vang999.sell) }
      });
      logger.success("Vàng Mi Hồng parsed successfully.", "GOLD-PRICE");
    } catch (err) {
      logger.error("Failed to scrape Vàng Mi Hồng.", err, "GOLD-PRICE");
      results.push({
        store: "Vàng Mi Hồng",
        storeEn: "mihong",
        nhaN: { buy: "N/A", sell: "N/A" },
        vang998: { buy: "N/A", sell: "N/A" },
        vang999: { buy: "N/A", sell: "N/A" }
      });
    }
  } finally {
    await browser.close();
  }

  // --- Calculate changes from previous session ---
  try {
    const historyFile = path.resolve(__dirname, "../../../data/last_gold_price.json");
    const dataDir = path.dirname(historyFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    let previousData: GoldStorePrice[] = [];
    if (fs.existsSync(historyFile)) {
      previousData = JSON.parse(fs.readFileSync(historyFile, "utf-8"));
    }

    for (const res of results) {
      const prev = previousData.find(p => p.storeEn === res.storeEn);
      if (prev) {
        if (res.storeEn === "world") {
          res.worldChange = calculateChange(res.worldUSD || "", prev.worldUSD, true);
          // calculate FX rate changes if previous values exist
          try {
            if ((res as any).worldRateBuy && (prev as any).worldRateBuy) {
              res.worldRateChangeBuy = calculateChange((res as any).worldRateBuy, (prev as any).worldRateBuy);
            }
            if ((res as any).worldRateSell && (prev as any).worldRateSell) {
              res.worldRateChangeSell = calculateChange((res as any).worldRateSell, (prev as any).worldRateSell);
            }
            if ((res as any).worldVNDBuy && (prev as any).worldVNDBuy) {
              // also keep VNĐ amount change if desired (not used currently)
            }
          } catch (e) { /* ignore */ }
        } else {
          if (res.nhaN && prev.nhaN) {
            res.nhaN.changeBuy = calculateChange(res.nhaN.buy, prev.nhaN.buy);
            res.nhaN.changeSell = calculateChange(res.nhaN.sell, prev.nhaN.sell);
          }
          if (res.vang998 && prev.vang998) {
            res.vang998.changeBuy = calculateChange(res.vang998.buy, prev.vang998.buy);
            res.vang998.changeSell = calculateChange(res.vang998.sell, prev.vang998.sell);
          }
          if (res.vang999 && prev.vang999) {
            res.vang999.changeBuy = calculateChange(res.vang999.buy, prev.vang999.buy);
            res.vang999.changeSell = calculateChange(res.vang999.sell, prev.vang999.sell);
          }
        }
      }
    }

    fs.writeFileSync(historyFile, JSON.stringify(results, null, 2));
  } catch (err) {
    logger.error("Failed to process gold price history", err, "GOLD-PRICE");
  }

  logger.success(`Gold price scraping complete. Collected data from ${results.length} stores.`, "GOLD-PRICE");
  return results;
}

/**
 * Fetches recent news articles specifically about gold prices.
 */
export async function fetchGoldNewsArticles(limit: number = 5): Promise<NewsArticle[]> {
  logger.info("Fetching recent gold news articles...", "GOLD-PRICE");
  try {
    const sources = [
      { id: "gold-vnexpress", name: "VnExpress Kinh Doanh", url: "https://vnexpress.net/rss/kinh-doanh.rss", category: "Gold", active: true },
      { id: "gold-thanhnien", name: "Thanh Niên Kinh Tế", url: "https://thanhnien.vn/rss/kinh-te.rss", category: "Gold", active: true },
      { id: "gold-tuoitre", name: "Tuổi Trẻ Kinh Doanh", url: "https://tuoitre.vn/rss/kinh-doanh.rss", category: "Gold", active: true }
    ];
    
    const rawItems = await fetchRssFeeds(sources);
    const normalizedRaw = await normalizeRawNews(rawItems);
    
    // Filter articles related to gold
    const goldArticles = normalizedRaw.filter(a => {
      const titleLower = (a.title || "").toLowerCase();
      const descLower = (a.description || "").toLowerCase();
      return titleLower.includes("vàng") || descLower.includes("vàng") || titleLower.includes("sjc") || descLower.includes("sjc");
    });
    
    // Ensure thumbnails exist and are not base64 placeholders
    const validArticles = goldArticles.filter(a => 
      a.thumbnail_url && 
      a.thumbnail_url.trim() !== "" && 
      a.thumbnail_url !== "NONE" &&
      !a.thumbnail_url.startsWith("data:image/")
    );
    
    // Sort by pub_date descending
    validArticles.sort((a, b) => b.pub_date.getTime() - a.pub_date.getTime());
    
    return validArticles.slice(0, limit) as NewsArticle[];
  } catch (err) {
    logger.error("Failed to fetch gold news articles", err, "GOLD-PRICE");
    return [];
  }
}
