import path from "path";
import fs from "fs";
import https from "https";
import { checkConfigAndLogWarnings } from "./config/env";
import { logger } from "./utils/logger";
import {
  RssSourceRepository,
  NewsArticleRepository,
  VideoHistoryRepository,
  RenderJobRepository,
  NewsArticle
} from "./modules/database/repositories";
import { fetchRssFeeds } from "./modules/rss/fetchRss";
import { normalizeRawNews } from "./modules/rss/normalizeNews";
import { deduplicateNewsArticles } from "./modules/news/deduplicateNews";
import { scoreArticles } from "./modules/news/scoreNews";
import { rankNewsArticles, rankNewsByCategory } from "./modules/ai/rankNews";
import { summarizeNewsArticles } from "./modules/ai/summarizeNews";
import { renderNewsArticlesToImages, renderGoldPriceSlides, CoverCategory } from "./modules/render/renderNewsCard";
import { createDriveFolder, uploadNewsReleaseToGoogleDrive } from "./modules/storage/googleDrive";
import { scrapeGoldPrices } from "./modules/news/goldPrice";
import { PipelineTracker, TopicKey } from "./utils/pipelineTracker";
import { getVietnamTime } from "./utils/date";

// ─── Topic definitions ────────────────────────────────────────────────────────
interface TopicDef {
  key: TopicKey;
  labelVi: string;
  coverCategory: CoverCategory;
  topN: number;
  folderSlug: string;
}

const TOPICS: TopicDef[] = [
  { key: "sports",        labelVi: "Thể Thao",  coverCategory: "THỂ THAO",  topN: 10, folderSlug: "sports" },
  { key: "politics",      labelVi: "Chính Trị", coverCategory: "CHÍNH TRỊ", topN: 10, folderSlug: "politics" },
  { key: "society",       labelVi: "Xã Hội",    coverCategory: "XÃ HỘI",    topN: 10, folderSlug: "society" },
  { key: "entertainment", labelVi: "Giải Trí",  coverCategory: "GIẢI TRÍ",  topN: 10, folderSlug: "entertainment" }
];

/**
 * Ensures a directory exists and is cleared of PNG slides.
 */
function prepareOutputDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  } else {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if ((file.startsWith("slide_") || file === "cover.png") && file.endsWith(".png")) {
        try { fs.unlinkSync(path.join(dir, file)); } catch (_) { }
      }
    }
  }
}

/**
 * Main manual workflow orchestrator
 */
export async function runWorkflow(): Promise<void> {
  const startTime = Date.now();
  logger.info("==================================================", "WORKFLOW");
  logger.info("STARTING AI MORNING NEWS VIDEO GENERATOR PIPELINE", "WORKFLOW");
  logger.info("==================================================", "WORKFLOW");

  // Reset topic states for a fresh run
  PipelineTracker.resetTopics();
  PipelineTracker.updateProgress({
    jobId: `job_${Date.now()}`,
    status: "running",
    step: "fetching_rss",
    stepName: "Tải tin tức RSS",
    percentage: 5,
    message: "Bắt đầu luồng chạy. Đang tải dữ liệu từ các nguồn báo chí...",
    error: undefined,
    videoTitle: undefined
  });

  checkConfigAndLogWarnings();

  let renderJobId: string | undefined;
  let videoRecordId: string | undefined;
  let videoTitle = "Bản Tin Sáng";

  try {
    // ─── 1. Fetch RSS Feeds ───────────────────────────────────────────────────
    const sources = await RssSourceRepository.getActiveSources();
    if (sources.length === 0) {
      throw new Error("No active RSS sources configured in database.");
    }

    const rawItems = await fetchRssFeeds(sources);
    if (rawItems.length === 0) {
      logger.warn("No news items fetched from RSS feeds. Exiting pipeline.", "WORKFLOW");
      PipelineTracker.updateProgress({ status: "idle", step: "idle", stepName: "Hệ thống đang chờ", percentage: 0, message: "Không tìm thấy bài viết RSS mới nào." });
      return;
    }

    // Build source lookup maps for AI ranking context
    const sourceMap: Record<string, string> = {};
    const sportSourceIds = new Set<string>();
    for (const src of sources) {
      sourceMap[src.id] = src.name;
      if (src.category === "Thể Thao") {
        sportSourceIds.add(src.id);
      }
    }
    logger.info(`Sport source IDs: [${[...sportSourceIds].join(", ")}]`, "WORKFLOW");

    // ─── 2. Normalize, Save, Deduplicate ─────────────────────────────────────
    const normalizedRaw = normalizeRawNews(rawItems);
    logger.info("Saving parsed raw articles to database...", "WORKFLOW");
    const savedArticles = await NewsArticleRepository.saveArticles(normalizedRaw);

    PipelineTracker.updateProgress({
      step: "ai_ranking",
      stepName: "AI Xếp Hạng & Tóm Tắt",
      percentage: 15,
      message: "Gemini AI đang chấm điểm và chọn lọc tin tức quan trọng..."
    });

    let candidateArticles = await NewsArticleRepository.getUnrankedArticles(24);
    if (candidateArticles.length === 0) {
      candidateArticles = savedArticles;
    } else {
      candidateArticles = candidateArticles.map((cand) => {
        const original = normalizedRaw.find((s) => s.url === cand.url);
        return { ...cand, thumbnail_url: original ? original.thumbnail_url : cand.thumbnail_url };
      });
    }

    // Keep only articles with valid thumbnails for slide rendering
    const candidatesWithThumbs = candidateArticles.filter((cand) => {
      const thumb = cand.thumbnail_url;
      return thumb && thumb.trim() !== "" && thumb !== "NONE";
    });

    if (candidatesWithThumbs.length === 0) {
      logger.warn("No candidate articles with thumbnails found. Exiting.", "WORKFLOW");
      PipelineTracker.updateProgress({ status: "idle", step: "idle", stepName: "Hệ thống đang chờ", percentage: 0, message: "Không có tin tức nào có ảnh minh họa hợp lệ." });
      return;
    }

    const deduplicated = deduplicateNewsArticles(candidatesWithThumbs);
    const preScored = scoreArticles(deduplicated);

    // Build date strings for folder naming and slide dates
    const vnTime = getVietnamTime();
    const dd = String(vnTime.getDate()).padStart(2, "0");
    const mm = String(vnTime.getMonth() + 1).padStart(2, "0");
    const yyyy = vnTime.getFullYear();
    const todayStr = `${dd}-${mm}-${yyyy}`;
    const timeStr = `${String(vnTime.getHours()).padStart(2, "0")}h${String(vnTime.getMinutes()).padStart(2, "0")}`;
    const dateDisplayStr = `${dd}/${mm}/${yyyy} - ${timeStr.replace("h", ":")}`;

    videoTitle = `Bản Tin Sáng ${todayStr}`;
    PipelineTracker.updateProgress({ videoTitle, message: `Chuẩn bị tổng hợp theo chủ đề: ${videoTitle}` });

    const videoRecord = await VideoHistoryRepository.createVideoRecord(videoTitle);
    videoRecordId = videoRecord.id;
    const rootDriveFolderName = videoTitle;
    const rootDriveFolder = await createDriveFolder(rootDriveFolderName);
    await VideoHistoryRepository.updateVideoRecord(videoRecordId, rootDriveFolder.folderId, rootDriveFolder.webViewUrl);
    logger.success(`[DRIVE] Root folder created: ${rootDriveFolder.webViewUrl}`, "WORKFLOW");

    const renderJob = await RenderJobRepository.createRenderJob(videoRecordId, "rendering");
    renderJobId = renderJob.id;

    const generalArticleIds = new Set<string>();

    // ─── 3. GENERAL: Top 20 Total ─────────────────────────────────────────────
    logger.info("==================================================", "WORKFLOW");
    logger.info("[GENERAL] Running Top 20 General Pipeline...", "WORKFLOW");
    logger.info("==================================================", "WORKFLOW");
    PipelineTracker.updateTopicProgress("general", { status: "running", percentage: 10, message: "AI đang xếp hạng 20 tin nổi bật nhất..." });

    try {
      const rankedArticles = await rankNewsArticles(preScored);
      const summarizedArticles = await summarizeNewsArticles(rankedArticles);

      for (const art of summarizedArticles) {
        generalArticleIds.add(art.id);
      }

      const dbUpdates = summarizedArticles.map((art) => ({ id: art.id, score: art.score || 0, is_ranked: true, summary: art.summary || "" }));
      await NewsArticleRepository.updateArticleSummariesAndRankings(dbUpdates);

      PipelineTracker.updateTopicProgress("general", { percentage: 50, message: "Đang dựng slide ảnh..." });
      PipelineTracker.updateProgress({ step: "generating_slides", stepName: "Tạo Slide Hình Ảnh", percentage: 30, message: "Đang tạo slide cho Bản Tin Tổng Hợp..." });

      const outroArticle: NewsArticle = {
        id: "outro-slide", title: " Cảm Ơn Quý Vị Đã Theo Dõi Bản Tin Hôm Nay",
        summary: "Chúc quý vị một ngày mới ngập tràn niềm vui, nhiều năng lượng và làm việc thật hiệu quả! Xin chào và hẹn gặp lại trong bản tin tiếp theo.",
        description: "", url: "https://whatnew.outro", pub_date: new Date(), score: 0, is_ranked: true, thumbnail_url: ""
      };
      const coverArticle: NewsArticle = {
        id: "cover-slide", title: "Tổng hợp tin tức", summary: `Sáng ngày ${dd}/${mm}/${yyyy}`,
        description: "", url: "https://whatnew.cover", pub_date: new Date(), score: 1000, is_ranked: true, thumbnail_url: ""
      };
      const renderArticles = [...summarizedArticles, outroArticle];
      const outputDir = path.resolve(__dirname, "../output/slides/general");
      prepareOutputDir(outputDir);

      await renderNewsArticlesToImages(renderArticles, { outputDir, sources, coverArticle, coverCategory: "BẢN TIN SÁNG" });
      PipelineTracker.updateTopicProgress("general", { percentage: 80, message: "Đang upload lên Google Drive..." });

      const driveFolderName = `${videoTitle} - ${timeStr} - Tổng Hợp`;
      const uploadResult = await uploadNewsReleaseToGoogleDrive(driveFolderName, "", "", outputDir, rootDriveFolder.folderId);
      PipelineTracker.updateTopicProgress("general", { status: "completed", percentage: 100, slideCount: renderArticles.length, driveUrl: rootDriveFolder.webViewUrl });
      logger.success(`[GENERAL] Done. Root Drive: ${rootDriveFolder.webViewUrl}`, "WORKFLOW");
    } catch (err: any) {
      logger.error("[GENERAL] Pipeline failed.", err, "WORKFLOW");
      PipelineTracker.updateTopicProgress("general", { status: "failed", error: err.message });
    }

    // ─── 4. CATEGORY TOPICS (Sports, Politics, Society, Entertainment) ────────
    let topicProgress = 35;
    for (const topic of TOPICS) {
      logger.info(`==================================================`, "WORKFLOW");
      logger.info(`[${topic.key.toUpperCase()}] Running ${topic.labelVi} Pipeline...`, "WORKFLOW");
      logger.info(`==================================================`, "WORKFLOW");

      PipelineTracker.updateTopicProgress(topic.key, { status: "running", percentage: 10, message: `AI đang chọn lọc top ${topic.topN} tin ${topic.labelVi}...` });
      PipelineTracker.updateProgress({ percentage: topicProgress, message: `Đang xử lý chủ đề: ${topic.labelVi}...` });

      try {
        const filteredPreScored = preScored.filter((art) => !generalArticleIds.has(art.id));

        // For Sports topic: boost articles from dedicated sports sources to the top of the pool
        // so they are never accidentally cut off by the 100-article slice in rankNewsByCategory
        let poolForRanking = filteredPreScored;
        if (topic.key === "sports" && sportSourceIds.size > 0) {
          const sportArticles   = filteredPreScored.filter(a => a.source_id && sportSourceIds.has(a.source_id));
          const otherArticles   = filteredPreScored.filter(a => !a.source_id || !sportSourceIds.has(a.source_id));
          poolForRanking = [...sportArticles, ...otherArticles];
          logger.info(`[SPORTS] Pool: ${sportArticles.length} sport-source articles boosted to top (total pool: ${poolForRanking.length}).`, "WORKFLOW");
        }

        const categoryRanked = await rankNewsByCategory(poolForRanking, topic.labelVi, topic.topN, sourceMap);
        if (categoryRanked.length === 0) {
          logger.warn(`[${topic.key.toUpperCase()}] No articles found for category [${topic.labelVi}]. Skipping.`, "WORKFLOW");
          PipelineTracker.updateTopicProgress(topic.key, { status: "completed", percentage: 100, slideCount: 0, message: "Không có tin trong chủ đề này hôm nay." });
          topicProgress += 12;
          continue;
        }

        const summarized = await summarizeNewsArticles(categoryRanked);
        PipelineTracker.updateTopicProgress(topic.key, { percentage: 50, message: "Đang dựng slide ảnh..." });

        const outroSlide: NewsArticle = {
          id: `outro-${topic.key}`, title: ` Cảm Ơn Quý Vị Đã Theo Dõi Bản Tin ${topic.labelVi}`,
          summary: "Chúc quý vị một ngày tràn đầy năng lượng! Hẹn gặp lại trong bản tin tiếp theo.",
          description: "", url: `https://whatnew.outro.${topic.key}`, pub_date: new Date(), score: 0, is_ranked: true, thumbnail_url: ""
        };
        const coverSlide: NewsArticle = {
          id: `cover-${topic.key}`, title: `${topic.labelVi} Nổi Bật`, summary: `Sáng ngày ${dd}/${mm}/${yyyy}`,
          description: "", url: `https://whatnew.cover.${topic.key}`, pub_date: new Date(), score: 1000, is_ranked: true, thumbnail_url: ""
        };
        const renderArticles = [...summarized, outroSlide];
        const outputDir = path.resolve(__dirname, `../output/slides/${topic.folderSlug}`);
        prepareOutputDir(outputDir);

        await renderNewsArticlesToImages(renderArticles, { outputDir, sources, coverArticle: coverSlide, coverCategory: topic.coverCategory });
        PipelineTracker.updateTopicProgress(topic.key, { percentage: 80, message: "Đang upload lên Google Drive..." });

        const driveFolderName = `${videoTitle} - ${timeStr} - ${topic.labelVi}`;
        const uploadResult = await uploadNewsReleaseToGoogleDrive(driveFolderName, "", "", outputDir, rootDriveFolder.folderId);
        PipelineTracker.updateTopicProgress(topic.key, { status: "completed", percentage: 100, slideCount: renderArticles.length, driveUrl: rootDriveFolder.webViewUrl });
        logger.success(`[${topic.key.toUpperCase()}] Done. Root Drive: ${rootDriveFolder.webViewUrl}`, "WORKFLOW");
      } catch (err: any) {
        logger.error(`[${topic.key.toUpperCase()}] Pipeline failed.`, err, "WORKFLOW");
        PipelineTracker.updateTopicProgress(topic.key, { status: "failed", error: err.message });
      }

      topicProgress += 12;
    }

    // ─── 5. GOLD PRICE ────────────────────────────────────────────────────────
    logger.info("==================================================", "WORKFLOW");
    logger.info("[GOLD] Running Giá Vàng Pipeline...", "WORKFLOW");
    logger.info("==================================================", "WORKFLOW");
    PipelineTracker.updateProgress({ step: "generating_slides", stepName: "Tạo Slide Giá Vàng", percentage: 83, message: "Đang scrape giá vàng từ 5 nguồn uy tín..." });
    PipelineTracker.updateTopicProgress("gold", { status: "running", percentage: 10, message: "Đang lấy giá vàng từ SJC, PNJ, Bảo Tín Minh Châu, Mi Hồng..." });

    try {
      const goldPrices = await scrapeGoldPrices();
      PipelineTracker.updateTopicProgress("gold", { percentage: 50, message: "Đang dựng slide giá vàng..." });

      const goldOutputDir = path.resolve(__dirname, "../output/slides/gold");
      prepareOutputDir(goldOutputDir);

      await renderGoldPriceSlides(goldPrices, goldOutputDir, dateDisplayStr);
      PipelineTracker.updateTopicProgress("gold", { percentage: 80, message: "Đang upload giá vàng lên Google Drive..." });

      const goldDriveFolderName = `${videoTitle} - ${timeStr} - Giá Vàng`;
      const goldUploadResult = await uploadNewsReleaseToGoogleDrive(goldDriveFolderName, "", "", goldOutputDir, rootDriveFolder.folderId);
      PipelineTracker.updateTopicProgress("gold", { status: "completed", percentage: 100, slideCount: goldPrices.length + 1, driveUrl: rootDriveFolder.webViewUrl });
      logger.success(`[GOLD] Done. Root Drive: ${rootDriveFolder.webViewUrl}`, "WORKFLOW");
    } catch (err: any) {
      logger.error("[GOLD] Gold price pipeline failed.", err, "WORKFLOW");
      PipelineTracker.updateTopicProgress("gold", { status: "failed", error: err.message });
    }

    // ─── 6. Finalize ──────────────────────────────────────────────────────────
    await RenderJobRepository.updateRenderJobStatus(renderJobId, "completed");

    const durationMin = ((Date.now() - startTime) / 60000).toFixed(2);
    logger.info("==================================================", "WORKFLOW");
    logger.success(`ALL TOPIC PIPELINES COMPLETED IN ${durationMin} MINUTES!`, "WORKFLOW");
    logger.info("==================================================", "WORKFLOW");

    PipelineTracker.updateProgress({
      status: "completed",
      step: "idle",
      stepName: "Hệ thống đang chờ",
      percentage: 100,
      message: `Đã hoàn tất tổng hợp "${videoTitle}" (6 chủ đề) sau ${durationMin} phút!`
    });

  } catch (error: any) {
    logger.error("WORKFLOW PIPELINE CRITICAL ERROR!", error, "WORKFLOW");
    if (renderJobId) {
      await RenderJobRepository.updateRenderJobStatus(renderJobId, "failed", error.message || String(error));
    }
    PipelineTracker.updateProgress({
      status: "failed",
      error: error.message || String(error),
      message: `Lỗi nghiêm trọng: ${error.message || String(error)}`
    });
  }
}

/**
 * Downloads a file from a URL and saves it to a local path (No external deps).
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: Status Code ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      fs.unlink(destPath, () => {}); // delete partial file on error
      reject(err);
    });
  });
}

// Automatically trigger main execution if file is run directly
if (require.main === module) {
  runWorkflow();
}
