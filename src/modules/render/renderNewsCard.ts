import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { NewsArticle } from "../database/repositories";
import { formatVietnameseDate } from "../../utils/date";
import { logger } from "../../utils/logger";
import { GoldStorePrice, fetchGoldNewsArticles } from "../news/goldPrice";

export type CoverCategory = "BẢN TIN SÁNG" | "THỂ THAO" | "CHÍNH TRỊ" | "XÃ HỘI" | "GIẢI TRÍ" | "GIÁ VÀNG";

interface RenderOptions {
  outputDir: string;
  sources?: any[];
  coverArticle?: NewsArticle;
  coverCategory?: CoverCategory;
}

const DEFAULT_FALLBACK_IMAGE = "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?q=80&w=800&auto=format&fit=crop";

const GRID_FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1512428559087-560fa5ceab42?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1477281765962-ef34e8bb0967?q=80&w=600&auto=format&fit=crop"
];

async function getImageAsDataUrl(url: string, fallbackUrl?: string): Promise<string> {
  const candidates: string[] = [];
  
  if (url && url.trim() !== "" && url !== "NONE") {
    candidates.push(url);
    
    // For thethao247 URLs, add clean weserv CDN proxy candidates to bypass Cloudflare WAF 403 on HF datacenter IPs
    if (url.includes("thethao247")) {
      candidates.push(`https://images.weserv.nl/?url=${encodeURIComponent(url)}`);
      candidates.push(`https://wsrv.nl/?url=${encodeURIComponent(url)}`);
      
      if (!url.includes("resize_")) {
        try {
          const u = new URL(url);
          if (u.pathname.startsWith("/storage/")) {
            u.pathname = `/resize_180x115${u.pathname}`;
            candidates.push(u.toString());
          }
        } catch (_) {}
      }
    }
  }

  if (fallbackUrl && !candidates.includes(fallbackUrl)) {
    candidates.push(fallbackUrl);
  }

  for (const targetUrl of candidates) {
    if (!targetUrl || targetUrl.trim() === "" || targetUrl === "NONE") continue;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout per fetch
      const res = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Referer": "https://thethao247.vn/"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") || "image/jpeg";
      return `data:${contentType};base64,${buffer.toString("base64")}`;
    } catch (err: any) {
      logger.warn(`[RENDER-PNG] getImageAsDataUrl candidate failed for ${targetUrl}: ${err.message}`, "RENDER-PNG");
    }
  }

  return "";
}

/**
 * Helper to fetch exactly 10 images for Cover & Outro collages as base64 Data URLs.
 * Seamlessly falls back to premium stock journalism photos if thumbnails fail.
 */
async function getGridImagesAsync(articlesList: NewsArticle[]): Promise<string[]> {
  const rawUrls = articlesList.map(a => a.thumbnail_url || "").filter(url => url.trim() !== "" && url !== "NONE");
  const urlsToFetch: string[] = [];
  
  for (let i = 0; i < 10; i++) {
    const primary = rawUrls[i];
    const fallback = GRID_FALLBACK_IMAGES[i % GRID_FALLBACK_IMAGES.length];
    urlsToFetch.push(primary || fallback);
  }

  const dataUrlPromises = urlsToFetch.map((url, idx) =>
    getImageAsDataUrl(url, GRID_FALLBACK_IMAGES[idx % GRID_FALLBACK_IMAGES.length])
  );
  return Promise.all(dataUrlPromises);
}

/**
 * Renders an array of ranked news articles into individual 1080x1920 PNG images using Playwright.
 * Generates files named 'slide_01.png', 'slide_02.png', etc. in the output directory.
 */
export async function renderNewsArticlesToImages(
  articles: NewsArticle[],
  options: RenderOptions
): Promise<string[]> {
  logger.info(`Starting rendering for ${articles.length} slides using Playwright...`, "RENDER-PNG");
  
  const { outputDir, coverCategory = "BẢN TIN SÁNG" } = options;
  
  // Ensure the output folder exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    logger.info(`Created output directory: ${outputDir}`, "RENDER-PNG");
  } else {
    // Clear any existing slides
    const files = fs.readdirSync(outputDir);
    for (const file of files) {
      if (file.startsWith("slide_") && file.endsWith(".png")) {
        fs.unlinkSync(path.join(outputDir, file));
      }
    }
    logger.info("Cleared old slides in output directory.", "RENDER-PNG");
  }
  
  const templatePath = path.resolve(__dirname, "../../templates/news-card.html");
  if (!fs.existsSync(templatePath)) {
    throw new Error(`News card template HTML not found at: ${templatePath}`);
  }
  
  logger.info(`Opening Chromium browser with Playwright...`, "RENDER-PNG");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security", "--ignore-certificate-errors"]
  });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    bypassCSP: true,
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  
  const imagePaths: string[] = [];
  const fileUrl = `file://${templatePath}`;
  
  logger.info(`Loading page template: ${fileUrl}`, "RENDER-PNG");
  await page.goto(fileUrl);
  
  // Wait explicitly for custom Web Fonts to load completely
  logger.info("Waiting for web fonts to load completely...", "RENDER-PNG");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000); // Safety buffer to settle layout
  
  // Render standalone cover image if provided
  if (options.coverArticle) {
    const coverArt = options.coverArticle;
    const coverPath = path.join(outputDir, "cover.png");
    
    // Grid images are pre-fetched as base64 Data URLs
    const gridImages = await getGridImagesAsync(articles);
    
    const cardData = {
      title: coverArt.title,
      summary: coverArt.summary || "",
      category: coverCategory,
      source: "Morning News",
      date: formatVietnameseDate(coverArt.pub_date),
      index: 0,
      total: articles.length - 1, // Exclude outro slide count
      thumbnail: "",
      gridImages: gridImages
    };
    
    logger.info(`Rendering cover slide (category: ${coverCategory}): ${coverPath}`, "RENDER-PNG");
    
    await page.evaluate((data) => {
      (window as any).updateCardContent(data);
    }, cardData);
    
    // Brief buffer for layout to settle (base64 images load instantly)
    await page.waitForTimeout(300);
    
    await page.screenshot({
      path: coverPath,
      type: "png",
      fullPage: false
    });
    
    logger.success(`Saved cover slide cover.png`, "RENDER-PNG");
  }
  
  for (let i = 0; i < articles.length; i++) {
    const art = articles[i];
    const index = i + 1;
    const padIndex = String(index).padStart(2, "0");
    const imagePath = path.join(outputDir, `slide_${padIndex}.png`);
    
    // Dynamic resolution of clean source name and category tags
    let sourceName = "Bản Tin Sáng";
    let category = "TIN NÓNG";
    let gridImages: string[] = [];
    
    if (art.id === "outro-slide") {
      sourceName = "Morning News";
      category = "TẠM BIỆT";
      // Outro grid images are the last 10 news articles
      gridImages = await getGridImagesAsync(articles.slice(0, -1).slice(-10));
    } else if (art.source_id && options.sources) {
      const matched = options.sources.find(s => s.id === art.source_id);
      if (matched) {
        const lower = matched.name.toLowerCase();
        if (lower.includes("vnexpress")) sourceName = "VnExpress";
        else if (lower.includes("tuổi trẻ") || lower.includes("tuoi tre")) sourceName = "Báo Tuổi Trẻ";
        else if (lower.includes("thanh niên") || lower.includes("thanh nien")) sourceName = "Báo Thanh Niên";
        else if (lower.includes("24h")) sourceName = "Báo 24h";
        else sourceName = matched.name;
      }
    }
    
    // Pre-fetch article thumbnail as base64 Data URL to guarantee instant, 100% reliable rendering in Chromium
    let thumbnailDataUrl = "";
    if (art.id !== "outro-slide" && art.thumbnail_url && art.thumbnail_url.trim() !== "" && art.thumbnail_url !== "NONE") {
      thumbnailDataUrl = await getImageAsDataUrl(art.thumbnail_url, DEFAULT_FALLBACK_IMAGE);
    }
    
    const cardData = {
      title: art.title,
      summary: art.summary || art.description || "",
      category: category,
      source: sourceName,
      date: formatVietnameseDate(art.pub_date),
      index: index,
      total: articles.length - 1, // Exclude outro slide count so indices display beautifully as X / 20
      thumbnail: thumbnailDataUrl,
      gridImages: gridImages
    };
    
    logger.info(`Rendering slide ${index}/${articles.length}: "${art.title.substring(0, 40)}..." (Thumbnail: ${art.thumbnail_url || "NONE"})`, "RENDER-PNG");
    
    // Inject dynamic data into the HTML page
    await page.evaluate((data) => {
      // Call the global JS method on our HTML page
      (window as any).updateCardContent(data);
    }, cardData);
    
    // Brief timeout to let animations/renders settle
    await page.waitForTimeout(300);
    
    // Screenshot at 1080x1920
    await page.screenshot({
      path: imagePath,
      type: "png",
      fullPage: false
    });
    
    imagePaths.push(imagePath);
    logger.success(`Saved slide slide_${padIndex}.png`, "RENDER-PNG");
  }
  
  await browser.close();
  logger.success(`Rendering complete. Successfully generated ${imagePaths.length} PNG slides.`, "RENDER-PNG");
  
  return imagePaths;
}

/**
 * Renders gold price slides for all 5 stores into individual 1080x1920 PNG images.
 */
export async function renderGoldPriceSlides(
  goldPrices: GoldStorePrice[],
  outputDir: string,
  dateStr: string
): Promise<string[]> {
  logger.info(`Starting gold price slide rendering for ${goldPrices.length} stores...`, "RENDER-PNG");
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  } else {
    const files = fs.readdirSync(outputDir);
    for (const file of files) {
      if ((file.startsWith("slide_") || file === "cover.png") && file.endsWith(".png")) {
        fs.unlinkSync(path.join(outputDir, file));
      }
    }
  }
  
  const templatePath = path.resolve(__dirname, "../../templates/news-card.html");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security", "--ignore-certificate-errors"]
  });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    bypassCSP: true,
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  await page.goto(`file://${templatePath}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
  
  const imagePaths: string[] = [];
  
  const goldArticles = await fetchGoldNewsArticles(goldPrices.length);
  
  // Pre-fetch thumbnails as base64 Data URLs for all gold articles
  const goldThumbDataUrls: string[] = [];
  const GOLD_THUMB_FALLBACK = "https://images.unsplash.com/photo-1610375461246-83df859d849d?q=80&w=800&auto=format&fit=crop";
  for (let i = 0; i < goldArticles.length; i++) {
    const rawThumb = goldArticles[i]?.thumbnail_url || "";
    const dataUrl = await getImageAsDataUrl(rawThumb, GOLD_THUMB_FALLBACK);
    goldThumbDataUrls.push(dataUrl || GOLD_THUMB_FALLBACK);
  }

  // Render one slide per store
  for (let i = 0; i < goldPrices.length; i++) {
    const store = goldPrices[i];
    const padIndex = String(i + 1).padStart(2, "0");
    const imagePath = path.join(outputDir, `slide_${padIndex}.png`);
    
    let goldRows: { label: string; buy: string; sell: string; changeBuy?: string; changeSell?: string }[] = [];
    
    if (store.storeEn === "world") {
      // World gold: show USD price and the FX rate (VND/USD) buy/sell
      goldRows = [
        { label: "Quốc Tế", buy: store.worldUSD || "N/A", sell: store.worldRateSell || "N/A", changeBuy: store.worldChange || "", changeSell: store.worldRateChangeSell || "" },
      ];
    } else {
      // Prioritize 999 gold (SJC/24k) as the main representative price for the store
      const mainGold = store.vang999 && store.vang999.buy !== "N/A" ? store.vang999 : store.nhaN;
      if (mainGold) {
         goldRows = [
           { label: store.store, buy: mainGold.buy, sell: mainGold.sell, changeBuy: mainGold.changeBuy, changeSell: mainGold.changeSell }
         ];
      }
    }
    
    // Assign a news article for the slide with preloaded base64 thumbnail
    const articleIdx = i % (goldArticles.length || 1);
    const article = goldArticles[articleIdx] || null;
    const thumbDataUrl = goldThumbDataUrls[articleIdx] || GOLD_THUMB_FALLBACK;

    const newsData = article ? {
      title: article.title,
      summary: article.description || article.summary,
      thumbnail: thumbDataUrl
    } : null;
    
    const goldSource = store.storeEn === "world" ? "Binance / CoinGecko" : "Báo 24h (24h.com.vn)";

    const cardData = {
      title: store.store,
      summary: "",
      category: "GOLD_TABLE",
      storeName: store.store,
      source: goldSource,
      date: dateStr,
      index: i + 1,
      total: goldPrices.length,
      thumbnail: "",
      goldRows,
      newsData
    };
    
    logger.info(`Rendering gold slide ${i + 1}/${goldPrices.length}: ${store.store}`, "RENDER-PNG");
    await page.evaluate((data) => { (window as any).updateCardContent(data); }, cardData);
    
    if (newsData && newsData.thumbnail) {
      try {
        await page.waitForFunction(() => {
          const img = document.getElementById("gold-news-thumb") as HTMLImageElement;
          return img && img.complete && img.naturalWidth > 0;
        }, undefined, { timeout: 6000 });
      } catch (err) {
        logger.warn(`News thumbnail failed to load within 6s for gold slide ${padIndex}`, "RENDER-PNG");
      }
    }
    
    await page.waitForTimeout(600);
    await page.screenshot({ path: imagePath, type: "png", fullPage: false });
    imagePaths.push(imagePath);
    logger.success(`Saved gold slide slide_${padIndex}.png`, "RENDER-PNG");
  }
  
  await browser.close();
  logger.success(`Gold price rendering complete. ${imagePaths.length} slides generated.`, "RENDER-PNG");
  return imagePaths;
}
