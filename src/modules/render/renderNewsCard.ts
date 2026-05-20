import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { NewsArticle } from "../database/repositories";
import { formatVietnameseDate } from "../../utils/date";
import { logger } from "../../utils/logger";
import { GoldStorePrice } from "../news/goldPrice";

export type CoverCategory = "BẢN TIN SÁNG" | "THỂ THAO" | "CHÍNH TRỊ" | "XÃ HỘI" | "GIẢI TRÍ" | "GIÁ VÀNG";

interface RenderOptions {
  outputDir: string;
  sources?: any[];
  coverArticle?: NewsArticle;
  coverCategory?: CoverCategory;
}

/**
 * Helper to fetch exactly 10 images for Cover & Outro collages.
 * Seamlessly falls back to premium stock journalism photos if thumbnails are missing.
 */
function getGridImages(articlesList: NewsArticle[]): string[] {
  const fallbacks = [
    "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1495020689067-958852a6565c?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1512428559087-560fa5ceab42?q=80&w=600&auto=format&fit=crop"
  ];
  
  const urls = articlesList.map(a => a.thumbnail_url || "").filter(url => url.trim() !== "");
  while (urls.length < 10) {
    urls.push(fallbacks[urls.length % fallbacks.length]);
  }
  return urls.slice(0, 10);
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
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Enforce the 1080x1920 vertical mobile viewport
  await page.setViewportSize({ width: 1080, height: 1920 });
  
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
    
    // Grid images are the first 4 articles' thumbnails
    const gridImages = getGridImages(articles);
    
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
    
    // Wait for all 10 grid images to fully load before screenshotting
    if (gridImages.length > 0) {
      try {
        await page.waitForFunction(() => {
          const imgs = Array.from({ length: 10 }, (_, k) =>
            document.getElementById(`grid-img-${k + 1}`) as HTMLImageElement
          );
          return imgs.every(img => img && img.complete && img.naturalWidth > 0);
        }, undefined, { timeout: 10000 });
      } catch (err) {
        logger.warn("Some grid images failed to load within 10s for cover slide, proceeding anyway.", "RENDER-PNG");
      }
    } else {
      await page.waitForTimeout(1000);
    }
    
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
      gridImages = getGridImages(articles.slice(0, -1).slice(-10));
    } else if (art.source_id && options.sources) {
      const matched = options.sources.find(s => s.id === art.source_id);
      if (matched) {
        const lower = matched.name.toLowerCase();
        if (lower.includes("vnexpress")) sourceName = "VnExpress";
        else if (lower.includes("tuổi trẻ") || lower.includes("tuoi tre")) sourceName = "Báo Tuổi Trẻ";
        else if (lower.includes("thanh niên") || lower.includes("thanh nien")) sourceName = "Báo Thanh Niên";
        else sourceName = matched.name;
      }
    }
    
    const cardData = {
      title: art.title,
      summary: art.summary || art.description || "",
      category: category,
      source: sourceName,
      date: formatVietnameseDate(art.pub_date),
      index: index,
      total: articles.length - 1, // Exclude outro slide count so indices display beautifully as X / 20
      thumbnail: art.thumbnail_url || "",
      gridImages: gridImages
    };
    
    logger.info(`Rendering slide ${index}/${articles.length}: "${art.title.substring(0, 40)}..." (Thumbnail: ${art.thumbnail_url || "NONE"})`, "RENDER-PNG");
    
    // Inject dynamic data into the HTML page
    await page.evaluate((data) => {
      // Call the global JS method on our HTML page
      (window as any).updateCardContent(data);
    }, cardData);
    
    // Wait for the thumbnail image to fully load in the DOM if a thumbnail is provided!
    if (art.thumbnail_url && art.thumbnail_url.trim() !== "") {
      try {
        await page.waitForFunction(() => {
          const img = document.getElementById("card-image") as HTMLImageElement;
          return img && img.complete && img.naturalWidth > 0;
        }, undefined, { timeout: 6000 });
      } catch (err) {
        logger.warn(`Thumbnail failed to load within 6s for slide ${padIndex}: ${art.thumbnail_url}`, "RENDER-PNG");
      }
    }
    
    // Brief timeout to let animations/renders settle
    await page.waitForTimeout(500);
    
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
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.goto(`file://${templatePath}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
  
  const imagePaths: string[] = [];
  
  // Render Cover slide for Gold
  const coverData = {
    title: "Giá Vàng Hôm Nay",
    summary: `Cập nhật ${dateStr}`,
    category: "GIÁ VÀNG",
    source: "WhatNew",
    date: dateStr,
    index: 0,
    total: goldPrices.length,
    thumbnail: "",
    gridImages: []
  };
  
  await page.evaluate((data) => { (window as any).updateCardContent(data); }, coverData);
  await page.waitForTimeout(1000);
  const coverPath = path.join(outputDir, "cover.png");
  await page.screenshot({ path: coverPath, type: "png", fullPage: false });
  logger.success(`Saved gold cover slide cover.png`, "RENDER-PNG");
  
  // Render one slide per store
  for (let i = 0; i < goldPrices.length; i++) {
    const store = goldPrices[i];
    const padIndex = String(i + 1).padStart(2, "0");
    const imagePath = path.join(outputDir, `slide_${padIndex}.png`);
    
    let goldRows: { label: string; buy: string; sell: string; changeBuy?: string; changeSell?: string }[] = [];
    
    if (store.storeEn === "world") {
      // World gold: show USD price and the FX rate (VND/USD) buy/sell
      goldRows = [
        { label: "Giá Quốc Tế (USD/oz)", buy: store.worldUSD || "N/A", sell: store.worldUSD || "N/A", changeBuy: store.worldChange || "", changeSell: store.worldChange || "" },
        { label: "Quy đổi (VND/USD)", buy: (store as any).worldRateBuy || (store as any).worldVNDBuy || store.worldVND || "N/A", sell: (store as any).worldRateSell || (store as any).worldVNDSell || store.worldVND || "N/A", changeBuy: (store as any).worldRateChangeBuy || "", changeSell: (store as any).worldRateChangeSell || "" }
      ];
    } else {
      if (store.nhaN) goldRows.push({ label: "Vàng Nhẫn", buy: store.nhaN.buy, sell: store.nhaN.sell, changeBuy: store.nhaN.changeBuy, changeSell: store.nhaN.changeSell });
      if (store.vang999) goldRows.push({ label: "Vàng 999 (24k)", buy: store.vang999.buy, sell: store.vang999.sell, changeBuy: store.vang999.changeBuy, changeSell: store.vang999.changeSell });
      if (store.vang998) goldRows.push({ label: "Vàng 980 (23.5k)", buy: store.vang998.buy, sell: store.vang998.sell, changeBuy: store.vang998.changeBuy, changeSell: store.vang998.changeSell });
    }
    
    const cardData = {
      title: store.store,
      summary: "",
      category: "GOLD_TABLE",
      storeName: store.store,
      source: store.store,
      date: dateStr,
      index: i + 1,
      total: goldPrices.length,
      thumbnail: "",
      goldRows
    };
    
    logger.info(`Rendering gold slide ${i + 1}/${goldPrices.length}: ${store.store}`, "RENDER-PNG");
    await page.evaluate((data) => { (window as any).updateCardContent(data); }, cardData);
    await page.waitForTimeout(600);
    await page.screenshot({ path: imagePath, type: "png", fullPage: false });
    imagePaths.push(imagePath);
    logger.success(`Saved gold slide slide_${padIndex}.png`, "RENDER-PNG");
  }
  
  await browser.close();
  logger.success(`Gold price rendering complete. ${imagePaths.length} slides generated.`, "RENDER-PNG");
  return imagePaths;
}
