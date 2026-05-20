import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";

export type TopicKey = "general" | "sports" | "politics" | "society" | "entertainment" | "gold";

export interface TopicProgress {
  status: "idle" | "running" | "completed" | "failed";
  percentage: number;
  slideCount: number;
  driveUrl?: string;
  message?: string;
  error?: string;
}

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
  topics: Record<TopicKey, TopicProgress>;
}

const DEFAULT_TOPICS: Record<TopicKey, TopicProgress> = {
  general:       { status: "idle", percentage: 0, slideCount: 0 },
  sports:        { status: "idle", percentage: 0, slideCount: 0 },
  politics:      { status: "idle", percentage: 0, slideCount: 0 },
  society:       { status: "idle", percentage: 0, slideCount: 0 },
  entertainment: { status: "idle", percentage: 0, slideCount: 0 },
  gold:          { status: "idle", percentage: 0, slideCount: 0 }
};

const STATE_FILE_PATH = path.resolve(process.cwd(), "database/pipeline-state.json");

export const PipelineTracker = {
  /**
   * Updates the overall progress state and saves it to the state JSON file.
   */
  updateProgress(progress: Partial<Omit<PipelineProgress, "topics">>): void {
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
        lastUpdated: new Date().toISOString(),
        topics: { ...DEFAULT_TOPICS }
      };

      if (fs.existsSync(STATE_FILE_PATH)) {
        try {
          const raw = fs.readFileSync(STATE_FILE_PATH, "utf-8");
          current = JSON.parse(raw);
          // Ensure topics always exists (backward compat)
          if (!current.topics) current.topics = { ...DEFAULT_TOPICS };
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
   * Updates the progress for a specific topic.
   */
  updateTopicProgress(topic: TopicKey, topicProgress: Partial<TopicProgress>): void {
    try {
      const dir = path.dirname(STATE_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let current: PipelineProgress = this.getProgress();
      if (!current.topics) current.topics = { ...DEFAULT_TOPICS };

      current.topics[topic] = {
        ...current.topics[topic],
        ...topicProgress
      };
      current.lastUpdated = new Date().toISOString();

      fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(current, null, 2), "utf-8");
    } catch (err) {
      logger.error(`Failed to write topic progress for [${topic}] to JSON file.`, err, "PIPELINE-TRACKER");
    }
  },

  /**
   * Resets all topic statuses to idle (call at the start of a new run).
   */
  resetTopics(): void {
    this.updateProgress({
      topics: { ...DEFAULT_TOPICS }
    } as any);
  },

  /**
   * Retrieves the current progress state from the state JSON file.
   */
  getProgress(): PipelineProgress {
    try {
      if (fs.existsSync(STATE_FILE_PATH)) {
        const raw = fs.readFileSync(STATE_FILE_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        if (!parsed.topics) parsed.topics = { ...DEFAULT_TOPICS };
        return parsed;
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
      lastUpdated: new Date().toISOString(),
      topics: { ...DEFAULT_TOPICS }
    };
  }
};
