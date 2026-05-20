import { chromium } from "playwright";
import path from "path";
import fs from "fs";

async function renderCoverAndOutro() {
  const outputDir = path.resolve(__dirname, "../../output/slides");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const templatePath = path.resolve(__dirname, "../templates/news-card.html");
  if (!fs.existsSync(templatePath)) {
    console.error(`Template not found at: ${templatePath}`);
    return;
  }

  console.log("Launching Chromium via Playwright...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1920 });

  const fileUrl = `file://${templatePath}`;
  console.log(`Navigating to template: ${fileUrl}`);
  await page.goto(fileUrl);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);

  const mockGridImages = [
    "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1495020689067-958852a6565c?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1512428559087-560fa5ceab42?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1526470608268-f674ce90ebd4?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1495020689067-958852a6565c?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=600&auto=format&fit=crop"
  ];

  // 1. Render Cover Slide
  const coverData = {
    title: "Tổng hợp tin tức",
    summary: "Sáng ngày 20/05/2026",
    category: "BẢN TIN SÁNG",
    source: "Morning News",
    date: "20/05/2026",
    index: 0,
    total: 20,
    thumbnail: "",
    gridImages: mockGridImages
  };

  console.log("Updating content for Cover Slide...");
  await page.evaluate((data) => {
    (window as any).updateCardContent(data);
  }, coverData);

  // Wait to load images
  await page.waitForTimeout(2000);

  const coverOutputPath = path.join(outputDir, "cover.png");
  console.log(`Taking screenshot for Cover: ${coverOutputPath}`);
  await page.screenshot({
    path: coverOutputPath,
    type: "png",
    fullPage: false
  });
  console.log("Cover slide rendered successfully!");

  // 2. Render Outro Slide
  const outroData = {
    title: "Cảm Ơn Quý Vị Đã Theo Dõi",
    summary: "Hẹn gặp lại quý vị vào bản tin tiếp theo!",
    category: "TẠM BIỆT",
    source: "Morning News",
    date: "20/05/2026",
    index: 21,
    total: 20,
    thumbnail: "",
    gridImages: mockGridImages
  };

  console.log("Updating content for Outro Slide...");
  await page.evaluate((data) => {
    (window as any).updateCardContent(data);
  }, outroData);

  // Wait to load images
  await page.waitForTimeout(2000);

  const outroOutputPath = path.join(outputDir, "outro.png");
  console.log(`Taking screenshot for Outro: ${outroOutputPath}`);
  await page.screenshot({
    path: outroOutputPath,
    type: "png",
    fullPage: false
  });
  console.log("Outro slide rendered successfully!");

  await browser.close();
  console.log("Done!");
}

renderCoverAndOutro().catch(console.error);
