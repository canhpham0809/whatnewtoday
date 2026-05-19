import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { NewsArticle } from "../database/repositories";
import { formatVietnameseDate } from "../../utils/date";
import { logger } from "../../utils/logger";

interface RenderOptions {
  outputDir: string;
  sources?: any[];
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
  
  const { outputDir } = options;
  
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
  
  for (let i = 0; i < articles.length; i++) {
    const art = articles[i];
    const index = i + 1;
    const padIndex = String(index).padStart(2, "0");
    const imagePath = path.join(outputDir, `slide_${padIndex}.png`);
    
    // Dynamic resolution of clean source name and category tags
    let sourceName = "Bản Tin Sáng";
    let category = "TIN NÓNG";
    
    if (art.id === "outro-slide") {
      sourceName = "Morning News";
      category = "TẠM BIỆT";
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
      total: articles.length,
      thumbnail: art.thumbnail_url || ""
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
