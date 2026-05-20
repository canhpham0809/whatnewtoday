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
import { rankNewsArticles } from "./modules/ai/rankNews";
import { summarizeNewsArticles } from "./modules/ai/summarizeNews";
import { renderNewsArticlesToImages } from "./modules/render/renderNewsCard";
import { compileVideo } from "./modules/render/createVideo";
import { uploadNewsReleaseToGoogleDrive } from "./modules/storage/googleDrive";
import { synthesizeSpeech } from "./modules/audio/tts";
import { postVideoToTikTok } from "./modules/social/tiktok";
import { PipelineTracker } from "./utils/pipelineTracker";
import { getVietnamTime } from "./utils/date";

/**
 * Main manual workflow orchestrator
 */
export async function runWorkflow(): Promise<void> {
  const startTime = Date.now();
  logger.info("==================================================", "WORKFLOW");
  logger.info("STARTING AI MORNING NEWS VIDEO GENERATOR PIPELINE", "WORKFLOW");
  logger.info("==================================================", "WORKFLOW");

  // Reset active state for a fresh run
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

  // Initialize configurations and logs
  checkConfigAndLogWarnings();

  // Track render job state in Supabase
  let renderJobId: string | undefined;
  let videoRecordId: string | undefined;
  let videoTitle = "Bản Tin Sáng";

  try {
    // 1. Fetch RSS Feeds
    const sources = await RssSourceRepository.getActiveSources();
    if (sources.length === 0) {
      throw new Error("No active RSS sources configured in database.");
    }

    const rawItems = await fetchRssFeeds(sources);
    if (rawItems.length === 0) {
      logger.warn("No news items fetched from RSS feeds. Exiting pipeline.", "WORKFLOW");
      PipelineTracker.updateProgress({
        status: "idle",
        step: "idle",
        stepName: "Hệ thống đang chờ",
        percentage: 0,
        message: "Không tìm thấy bài viết RSS mới nào để xử lý."
      });
      return;
    }

    // 2. Normalize and Save Raw Articles to DB
    const normalizedRaw = normalizeRawNews(rawItems);
    logger.info("Saving parsed raw articles to database...", "WORKFLOW");
    const savedArticles = await NewsArticleRepository.saveArticles(normalizedRaw);

    // 3. Retrieve unranked articles for the day (past 24h)
    PipelineTracker.updateProgress({
      step: "ai_ranking",
      stepName: "AI Xếp Hạng & Tóm Tắt",
      percentage: 20,
      message: "Gemini AI đang chấm điểm, chọn lọc và tóm tắt tin tức quan trọng..."
    });

    let candidateArticles = await NewsArticleRepository.getUnrankedArticles(24);
    if (candidateArticles.length === 0) {
      logger.warn("No unranked articles available for ranking. Re-fetching saved list from run...", "WORKFLOW");
      candidateArticles = savedArticles;
    } else {
      // Restore in-memory transient properties like thumbnail_url from the fresh fetch matching against pure in-memory normalized list!
      candidateArticles = candidateArticles.map((cand) => {
        const original = normalizedRaw.find((s) => s.url === cand.url);
        return {
          ...cand,
          thumbnail_url: original ? original.thumbnail_url : cand.thumbnail_url
        };
      });
    }

    // Filter: Only keep candidate articles that have a valid thumbnail image
    candidateArticles = candidateArticles.filter((cand) => {
      const thumb = cand.thumbnail_url;
      return thumb && thumb.trim() !== "" && thumb !== "NONE";
    });

    if (candidateArticles.length === 0) {
      logger.warn("No candidate articles with thumbnails found to process. Exiting.", "WORKFLOW");
      PipelineTracker.updateProgress({
        status: "idle",
        step: "idle",
        stepName: "Hệ thống đang chờ",
        percentage: 0,
        message: "Không có tin tức nào có ảnh minh họa hợp lệ để tạo video."
      });
      return;
    }

    // 4. Deduplicate Articles
    const deduplicated = deduplicateNewsArticles(candidateArticles);

    // 5. Pre-score and sort by raw priority
    const preScored = scoreArticles(deduplicated);

    // 6. Gemini Ranking (Select Top 20)
    const rankedArticles = await rankNewsArticles(preScored);
    if (rankedArticles.length === 0) {
      throw new Error("AI Ranking returned 0 selected articles.");
    }

    // 7. Gemini Summarization (30-50 words batch)
    const summarizedArticles = await summarizeNewsArticles(rankedArticles);

    // 8. Update database with AI summaries and rankings
    const dbUpdates = summarizedArticles.map((art) => ({
      id: art.id,
      score: art.score || 0,
      is_ranked: true,
      summary: art.summary || ""
    }));
    await NewsArticleRepository.updateArticleSummariesAndRankings(dbUpdates);

    // Create pre-emptive video history and render job entries to trace pipeline
    const vnTime = getVietnamTime();
    const dd = String(vnTime.getDate()).padStart(2, "0");
    const mm = String(vnTime.getMonth() + 1).padStart(2, "0");
    const yyyy = vnTime.getFullYear();
    const todayStr = `${dd}-${mm}-${yyyy}`;
    videoTitle = `Bản Tin Sáng ${todayStr}`;
    PipelineTracker.updateProgress({
      videoTitle,
      message: `Đã hoàn tất tổng hợp AI. Đang chuẩn bị xuất bản: ${videoTitle}`
    });

    const videoRecord = await VideoHistoryRepository.createVideoRecord(videoTitle);
    videoRecordId = videoRecord.id;

    const renderJob = await RenderJobRepository.createRenderJob(videoRecordId, "rendering");
    renderJobId = renderJob.id;

    // 9. Render PNG Images with Playwright
    PipelineTracker.updateProgress({
      step: "generating_slides",
      stepName: "Tạo Slide Hình Ảnh",
      percentage: 45,
      message: "Playwright đang tự động dựng thẻ ảnh tin tức slide..."
    });

    const outputDir = path.resolve(__dirname, "../output/slides");
    const audioTracksDir = path.resolve(__dirname, "../output/audio");

    logger.info("Cleaning up output directories from previous runs...", "WORKFLOW");
    if (fs.existsSync(outputDir)) {
      fs.readdirSync(outputDir).forEach((file) => {
        try { fs.unlinkSync(path.join(outputDir, file)); } catch (_) { }
      });
    } else {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (fs.existsSync(audioTracksDir)) {
      fs.readdirSync(audioTracksDir).forEach((file) => {
        try { fs.unlinkSync(path.join(audioTracksDir, file)); } catch (_) { }
      });
    } else {
      fs.mkdirSync(audioTracksDir, { recursive: true });
    }

    // Prepare Cover & Outro slide details
    const coverArticle: NewsArticle = {
      id: "cover-slide",
      title: "Tổng hợp tin tức",
      summary: `Sáng ngày ${dd}/${mm}/${yyyy}`,
      description: "Bản tin tổng hợp sáng ngày hôm nay",
      url: "https://whatnew.cover",
      pub_date: new Date(),
      score: 1000,
      is_ranked: true,
      thumbnail_url: ""
    };

    const outroArticle: NewsArticle = {
      id: "outro-slide",
      title: " Cảm Ơn Quý Vị Đã Theo Dõi Bản Tin Hôm Nay",
      summary: "Chúc quý vị một ngày mới ngập tràn niềm vui, nhiều năng lượng và làm việc thật hiệu quả! Xin chào và hẹn gặp lại trong bản tin tiếp theo.",
      description: "Chúc quý vị một ngày mới tràn đầy niềm vui!",
      url: "https://whatnew.outro",
      pub_date: new Date(),
      score: 0,
      is_ranked: true,
      thumbnail_url: "" // No thumbnail for the outro, centered layout is beautiful!
    };
    
    // Slide deck contains exactly the 20 news articles and the 1 outro slide
    const renderArticles = [...summarizedArticles, outroArticle];

    const imagePaths = await renderNewsArticlesToImages(renderArticles, { 
      outputDir, 
      sources,
      coverArticle
    });

    // 9.5. Synthesize TTS Voice-Overs (Commented out in Image-Only Mode)
    /*
    PipelineTracker.updateProgress({
      step: "synthesizing_audio",
      stepName: "Thuyết Minh AI (TTS)",
      percentage: 60,
      message: `Đang chuyển đổi văn bản thành giọng nói tin tức (tổng số: ${renderArticles.length} slides)...`
    });

    logger.info("Synthesizing news announcer voice-overs for articles...", "WORKFLOW");
    for (let i = 0; i < renderArticles.length; i++) {
      const art = renderArticles[i];
      const indexStr = String(i + 1).padStart(2, "0");
      const audioOutputPath = path.join(audioTracksDir, `slide_${indexStr}.mp3`);

      const ttsText = art.title; // Only synthesize the title as requested!
      try {
        PipelineTracker.updateProgress({
          message: `Đang lồng tiếng thuyết minh cho slide ${i + 1}/${renderArticles.length}...`
        });
        await synthesizeSpeech(ttsText, audioOutputPath);
        // Add a 3s cooldown delay to prevent CDN rate-limiting WebSocket throttling
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } catch (ttsErr) {
        logger.warn(`Failed to synthesize TTS for slide ${indexStr}. Skipping voice track.`, "WORKFLOW");
      }
    }
    */

    // 10. Compile Video with FFmpeg (Commented out in Image-Only Mode)
    /*
    PipelineTracker.updateProgress({
      step: "rendering_video",
      stepName: "Đóng Gói Video",
      percentage: 75,
      message: "FFmpeg đang xử lý ghép thẻ ảnh, âm thanh thuyết minh và nhạc nền..."
    });

    const outputVideoPath = path.resolve(__dirname, `../output/morning_news_${Date.now()}.mp4`);
    const bgMusicPath = path.resolve(__dirname, "../assets/bg-music.mp3");

    // Automatically download background music if not present (especially for Cloud containers)
    if (!fs.existsSync(bgMusicPath)) {
      const bgMusicUrl = process.env.BG_MUSIC_URL || "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3";
      logger.info(`Background music not found locally. Downloading from URL: ${bgMusicUrl}...`, "WORKFLOW");
      try {
        const assetsDir = path.dirname(bgMusicPath);
        if (!fs.existsSync(assetsDir)) {
          fs.mkdirSync(assetsDir, { recursive: true });
        }
        await downloadFile(bgMusicUrl, bgMusicPath);
        logger.success("Background music downloaded successfully!", "WORKFLOW");
      } catch (dlErr) {
        logger.error("Failed to download background music. Video will compile without bg music.", dlErr, "WORKFLOW");
      }
    }

    await compileVideo({
      slidesDir: outputDir,
      outputVideoPath,
      bgMusicPath,
      slideDurationSeconds: 5,
      audioTracksDir
    });
    */

    // 11. Upload Dedicated News Release Folder to Google Drive (Slides Only)
    PipelineTracker.updateProgress({
      step: "uploading_drive",
      stepName: "Đồng Bộ Cloud S3/Drive",
      percentage: 85,
      message: "Đang tải slide ảnh bản tin lên thư mục Google Drive bảo mật..."
    });

    const vnNow = getVietnamTime();
    const timeStr = `${String(vnNow.getHours()).padStart(2, "0")}h${String(vnNow.getMinutes()).padStart(2, "0")}`;
    const driveFolderName = `Bản Tin Sáng ${todayStr} - ${timeStr}`;
    const uploadResult = await uploadNewsReleaseToGoogleDrive(
      driveFolderName,
      "", // No video path in Image-Only Mode
      "", // No video file name in Image-Only Mode
      outputDir
    );

    // 12. Automatically Post Video to TikTok (Commented out in Image-Only Mode)
    const tiktokPublishId = "SKIPPED_IMAGE_ONLY";
    const tiktokUrl = "N/A";

    // 13. Update video compilation and render logs in Database
    const metadata = {
      total_articles: summarizedArticles.length,
      tiktok_publish_id: tiktokPublishId,
      tiktok_url: tiktokUrl,
      articles: summarizedArticles.map((a) => ({
        id: a.id,
        title: a.title,
        score: a.score,
        summary: a.summary
      }))
    };

    // Write upload details back to Video History
    if (videoRecordId) {
      await VideoHistoryRepository.updateVideoRecord(videoRecordId, uploadResult.folderId, uploadResult.webViewUrl, metadata);
    }

    // Complete render job status
    await RenderJobRepository.updateRenderJobStatus(renderJobId, "completed");

    const durationMin = ((Date.now() - startTime) / 60000).toFixed(2);
    logger.info("==================================================", "WORKFLOW");
    logger.success(`PIPELINE EXECUTED SUCCESSFULLY IN ${durationMin} MINUTES!`, "WORKFLOW");
    logger.success(`Google Drive URL: ${uploadResult.webViewUrl}`, "WORKFLOW");
    logger.info("==================================================", "WORKFLOW");

    // Success final progress update
    PipelineTracker.updateProgress({
      status: "completed",
      step: "idle",
      stepName: "Hệ thống đang chờ",
      percentage: 100,
      message: `Bản tin "${videoTitle}" (chỉ sinh ảnh) đã được xuất bản thành công sau ${durationMin} phút!`
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
