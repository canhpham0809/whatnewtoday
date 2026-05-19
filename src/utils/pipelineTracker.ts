import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";

export interface PipelineProgress {
  jobId: string;
  step: "idle" | "fetching_rss" | "ai_ranking" | "generating_slides" | "synthesizing_audio" | "rendering_video" | "uploading_drive" | "posting_tiktok";
  stepName: string;
  percentage: number;
  status: "idle" | "running" | "completed" | "failed";
  message: string;
  lastUpdated: string;
  error?: string;
  videoTitle?: string;
}

const STATE_FILE_PATH = path.resolve(process.cwd(), "database/pipeline-state.json");

export const PipelineTracker = {
  /**
   * Updates the progress state and saves it to the state JSON file.
   */
  updateProgress(progress: Partial<PipelineProgress>): void {
    try {
      const dir = path.dirname(STATE_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let current: PipelineProgress = {
        jobId: "",
        step: "idle",
        stepName: "Hệ thống đang chờ",
        percentage: 0,
        status: "idle",
        message: "Chờ kích hoạt lịch trình tự động...",
        lastUpdated: new Date().toISOString()
      };

      if (fs.existsSync(STATE_FILE_PATH)) {
        try {
          const raw = fs.readFileSync(STATE_FILE_PATH, "utf-8");
          current = JSON.parse(raw);
        } catch (e) {
          // File might be empty or invalid, fallback to default
        }
      }

      const updated = {
        ...current,
        ...progress,
        lastUpdated: new Date().toISOString()
      };

      fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(updated, null, 2), "utf-8");
    } catch (err) {
      logger.error("Failed to write pipeline progress to JSON file.", err, "PIPELINE-TRACKER");
    }
  },

  /**
   * Retrieves the current progress state from the state JSON file.
   */
  getProgress(): PipelineProgress {
    try {
      if (fs.existsSync(STATE_FILE_PATH)) {
        const raw = fs.readFileSync(STATE_FILE_PATH, "utf-8");
        return JSON.parse(raw);
      }
    } catch (e) {
      // Fallback
    }

    return {
      jobId: "",
      step: "idle",
      stepName: "Hệ thống đang chờ",
      percentage: 0,
      status: "idle",
      message: "Chờ kích hoạt lịch trình tự động...",
      lastUpdated: new Date().toISOString()
    };
  }
};
