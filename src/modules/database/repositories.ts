import { supabase } from "./supabaseClient";
import env from "../../config/env";
import { logger } from "../../utils/logger";

// Define Interfaces
export interface RssSource {
  id: string;
  name: string;
  url: string;
  category: string;
  active: boolean;
  created_at?: string;
}

export interface NewsArticle {
  id: string;
  source_id?: string;
  title: string;
  description?: string;
  content?: string;
  url: string;
  pub_date: Date;
  guid?: string;
  normalized_title?: string;
  normalized_content?: string;
  score?: number;
  is_ranked?: boolean;
  summary?: string;
  thumbnail_url?: string;
  created_at?: Date;
}

export interface VideoHistory {
  id: string;
  video_title: string;
  drive_file_id?: string;
  drive_url?: string;
  meta_data?: any;
  created_at?: string;
}

export interface RenderJob {
  id: string;
  video_id?: string;
  status: "pending" | "rendering" | "completed" | "failed";
  error_message?: string;
  created_at?: string;
}

// In-Memory Fallback Database
const mockRssSources: RssSource[] = [
  { id: "11111111-1111-1111-1111-111111111111", name: "VnExpress Tin Nổi Bật", url: "https://vnexpress.net/rss/tin-noi-bat.rss", category: "Featured", active: true },
  { id: "22222222-2222-2222-2222-222222222222", name: "VnExpress Thế Giới", url: "https://vnexpress.net/rss/the-gioi.rss", category: "World", active: true },
  { id: "33333333-3333-3333-3333-333333333333", name: "VnExpress Thời Sự", url: "https://vnexpress.net/rss/thoi-su.rss", category: "Current Affairs", active: true },
  { id: "44444444-4444-4444-4444-444444444444", name: "Tuổi Trẻ Mới Nhất", url: "https://tuoitre.vn/rss/tin-moi-nhat.rss", category: "Featured", active: true },
  { id: "55555555-5555-5555-5555-555555555555", name: "Thanh Niên Nóng", url: "https://thanhnien.vn/rss/home.rss", category: "Featured", active: true }
];

let mockNewsArticles: NewsArticle[] = [];
const mockVideoHistory: VideoHistory[] = [];
const mockRenderJobs: RenderJob[] = [];

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 1. RssSource Repository
export const RssSourceRepository = {
  async getActiveSources(): Promise<RssSource[]> {
    if (env.isSupabaseMock) {
      logger.info("Reading active RSS sources from memory.", "REPO-RSS");
      return mockRssSources.filter((s) => s.active);
    }
    
    logger.info("Fetching active RSS sources from Supabase.", "REPO-RSS");
    const { data, error } = await supabase!
      .from("rss_sources")
      .select("*")
      .eq("active", true);
      
    if (error) {
      logger.error("Error fetching RSS sources. Falling back to default list.", error, "REPO-RSS");
      return mockRssSources.filter((s) => s.active);
    }
    
    // Self-healing: If the table exists but is completely empty, auto-seed it with defaults
    if (!data || data.length === 0) {
      logger.warn("No active RSS sources found in Supabase. Attempting to auto-seed table...", "REPO-RSS");
      
      const seedData = mockRssSources.map(s => ({
        name: s.name,
        url: s.url,
        category: s.category,
        active: s.active
      }));
      
      const { data: seededData, error: seedError } = await supabase!
        .from("rss_sources")
        .insert(seedData)
        .select();
        
      if (seedError) {
        logger.error("Failed to auto-seed RSS sources in Supabase. Falling back to local in-memory sources.", seedError, "REPO-RSS");
        return mockRssSources.filter((s) => s.active);
      }
      
      logger.success(`Successfully auto-seeded ${seededData?.length || 0} active RSS sources in Supabase.`, "REPO-RSS");
      return seededData || mockRssSources.filter((s) => s.active);
    }
    
    return data;
  }
};

// 2. NewsArticle Repository
export const NewsArticleRepository = {
  async saveArticles(articles: Omit<NewsArticle, "id">[]): Promise<NewsArticle[]> {
    if (env.isSupabaseMock) {
      logger.info(`Saving ${articles.length} articles to memory.`, "REPO-NEWS");
      const saved: NewsArticle[] = [];
      for (const art of articles) {
        // Simple deduplication on URL for mock state
        const exists = mockNewsArticles.some((x) => x.url === art.url);
        if (!exists) {
          const newArt: NewsArticle = {
            id: generateUUID(),
            ...art,
            created_at: new Date()
          };
          mockNewsArticles.push(newArt);
          saved.push(newArt);
        }
      }
      return saved;
    }

    logger.info(`Saving ${articles.length} articles to Supabase.`, "REPO-NEWS");
    // Bulk upsert/insert with ON CONFLICT DO NOTHING
    const { data, error } = await supabase!
      .from("news_articles")
      .upsert(
        articles.map((a) => ({
          source_id: a.source_id,
          title: a.title,
          description: a.description,
          content: a.content,
          url: a.url,
          pub_date: a.pub_date.toISOString(),
          guid: a.guid,
          normalized_title: a.normalized_title,
          normalized_content: a.normalized_content
        })),
        { onConflict: "url", ignoreDuplicates: true }
      )
      .select();

    if (error) {
      logger.warn("Error saving articles to Supabase (likely due to RLS write policies or schema issues). Falling back to memory-managed articles for this run.", "REPO-NEWS");
      logger.debug(`Supabase error details: ${JSON.stringify(error)}`, "REPO-NEWS");
      
      // Highly defensive fallback: generate temporary UUIDs and return the normalized array 
      // so the pipeline can successfully proceed to Gemini AI and rendering modules!
      return articles.map((a) => ({
        id: generateUUID(),
        ...a,
        created_at: new Date()
      }));
    }

    return (data || []).map((d: any) => ({
      ...d,
      pub_date: new Date(d.pub_date),
      created_at: new Date(d.created_at)
    }));
  },

  async getUnrankedArticles(hoursAgo = 24): Promise<NewsArticle[]> {
    const cutoffDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    
    if (env.isSupabaseMock) {
      logger.info(`Fetching unranked articles since last ${hoursAgo} hours from memory.`, "REPO-NEWS");
      return mockNewsArticles.filter(
        (a) => a.pub_date >= cutoffDate && !a.is_ranked
      );
    }

    logger.info(`Fetching unranked articles since last ${hoursAgo} hours from Supabase.`, "REPO-NEWS");
    const { data, error } = await supabase!
      .from("news_articles")
      .select("*")
      .gte("pub_date", cutoffDate.toISOString())
      .eq("is_ranked", false);

    if (error) {
      logger.error("Error fetching unranked articles from Supabase.", error, "REPO-NEWS");
      return [];
    }

    return (data || []).map((d: any) => ({
      ...d,
      pub_date: new Date(d.pub_date),
      created_at: new Date(d.created_at)
    }));
  },

  async updateArticleSummariesAndRankings(
    updates: { id: string; score: number; is_ranked: boolean; summary: string }[]
  ): Promise<void> {
    if (env.isSupabaseMock) {
      logger.info(`Updating ${updates.length} articles with AI rankings in memory.`, "REPO-NEWS");
      for (const update of updates) {
        const art = mockNewsArticles.find((a) => a.id === update.id);
        if (art) {
          art.score = update.score;
          art.is_ranked = update.is_ranked;
          art.summary = update.summary;
        }
      }
      return;
    }

    logger.info(`Updating ${updates.length} articles with AI rankings in Supabase.`, "REPO-NEWS");
    
    // We update individually since bulk update of different columns/rows is complex in single query.
    // However, since it is 20 articles max, doing it in parallel is highly performant.
    const promises = updates.map(async (u) => {
      const { error } = await supabase!
        .from("news_articles")
        .update({
          score: u.score,
          is_ranked: u.is_ranked,
          summary: u.summary
        })
        .eq("id", u.id);
        
      if (error) {
        logger.error(`Error updating article ${u.id} in Supabase.`, error, "REPO-NEWS");
      }
    });

    await Promise.all(promises);
  },

  async cleanupOldArticles(daysToKeep = 7): Promise<void> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
    
    if (env.isSupabaseMock) {
      logger.info(`Cleaning up articles older than ${daysToKeep} days in memory.`, "REPO-NEWS");
      mockNewsArticles = mockNewsArticles.filter(a => new Date(a.created_at || a.pub_date) >= new Date(cutoffDate));
      return;
    }

    logger.info(`Cleaning up articles older than ${daysToKeep} days in Supabase.`, "REPO-NEWS");
    const { error } = await supabase!
      .from("news_articles")
      .delete()
      .lt("created_at", cutoffDate);

    if (error) {
      logger.error("Error cleaning up old articles.", error, "REPO-NEWS");
    } else {
      logger.success("Old articles cleanup completed.", "REPO-NEWS");
    }
  }
};

// 3. VideoHistory Repository
export const VideoHistoryRepository = {
  async createVideoRecord(
    videoTitle: string,
    driveFileId?: string,
    driveUrl?: string,
    metadata?: any
  ): Promise<VideoHistory> {
    if (env.isSupabaseMock) {
      logger.info("Creating video compilation history in memory.", "REPO-VIDEO");
      const record: VideoHistory = {
        id: generateUUID(),
        video_title: videoTitle,
        drive_file_id: driveFileId,
        drive_url: driveUrl,
        meta_data: metadata,
        created_at: new Date().toISOString()
      };
      mockVideoHistory.push(record);
      return record;
    }

    logger.info("Creating video compilation history in Supabase.", "REPO-VIDEO");
    const { data, error } = await supabase!
      .from("video_history")
      .insert({
        video_title: videoTitle,
        drive_file_id: driveFileId,
        drive_url: driveUrl,
        meta_data: metadata
      })
      .select()
      .single();

    if (error) {
      logger.error("Error creating video compilation history in Supabase.", error, "REPO-VIDEO");
      // Fallback
      return {
        id: generateUUID(),
        video_title: videoTitle,
        drive_file_id: driveFileId,
        drive_url: driveUrl,
        meta_data: metadata,
        created_at: new Date().toISOString()
      };
    }

    return data;
  },

  async getRecentHistory(limit = 10): Promise<VideoHistory[]> {
    if (env.isSupabaseMock) {
      return [...mockVideoHistory]
        .sort((a, b) => new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime())
        .slice(0, limit);
    }
    const { data, error } = await supabase!
      .from("video_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return error ? [] : data;
  },

  async updateVideoRecord(
    id: string,
    driveFileId?: string,
    driveUrl?: string,
    metadata?: any
  ): Promise<void> {
    if (env.isSupabaseMock) {
      logger.info(`Updating video compilation history ${id} in memory.`, "REPO-VIDEO");
      const record = mockVideoHistory.find((r) => r.id === id);
      if (record) {
        if (driveFileId) record.drive_file_id = driveFileId;
        if (driveUrl) record.drive_url = driveUrl;
        if (metadata) record.meta_data = metadata;
      }
      return;
    }

    logger.info(`Updating video compilation history ${id} in Supabase.`, "REPO-VIDEO");
    const { error } = await supabase!
      .from("video_history")
      .update({
        drive_file_id: driveFileId,
        drive_url: driveUrl,
        meta_data: metadata
      })
      .eq("id", id);

    if (error) {
      logger.error(`Error updating video compilation history ${id} in Supabase.`, error, "REPO-VIDEO");
    }
  },

  async cleanupOldRecords(daysToKeep = 30): Promise<void> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
    
    if (env.isSupabaseMock) {
      logger.info(`Cleaning up video history older than ${daysToKeep} days in memory.`, "REPO-VIDEO");
      // Optional: clean up mock array
      return;
    }

    logger.info(`Cleaning up video history older than ${daysToKeep} days in Supabase.`, "REPO-VIDEO");
    const { error } = await supabase!
      .from("video_history")
      .delete()
      .lt("created_at", cutoffDate);

    if (error) {
      logger.error("Error cleaning up old video history.", error, "REPO-VIDEO");
    }
  }
};

// 4. RenderJob Repository
export const RenderJobRepository = {
  async createRenderJob(videoId?: string, status: RenderJob["status"] = "pending"): Promise<RenderJob> {
    if (env.isSupabaseMock) {
      logger.info("Creating rendering job in memory.", "REPO-RENDER");
      const record: RenderJob = {
        id: generateUUID(),
        video_id: videoId,
        status,
        created_at: new Date().toISOString()
      };
      mockRenderJobs.push(record);
      return record;
    }

    logger.info("Creating rendering job in Supabase.", "REPO-RENDER");
    const { data, error } = await supabase!
      .from("render_jobs")
      .insert({
        video_id: videoId,
        status
      })
      .select()
      .single();

    if (error) {
      logger.error("Error creating rendering job in Supabase.", error, "REPO-RENDER");
      return {
        id: generateUUID(),
        video_id: videoId,
        status,
        created_at: new Date().toISOString()
      };
    }

    return data;
  },

  async updateRenderJobStatus(
    jobId: string,
    status: RenderJob["status"],
    errorMessage?: string
  ): Promise<void> {
    if (env.isSupabaseMock) {
      logger.info(`Updating render job ${jobId} status to '${status}' in memory.`, "REPO-RENDER");
      const job = mockRenderJobs.find((j) => j.id === jobId);
      if (job) {
        job.status = status;
        job.error_message = errorMessage;
      }
      return;
    }

    logger.info(`Updating render job ${jobId} status to '${status}' in Supabase.`, "REPO-RENDER");
    const { error } = await supabase!
      .from("render_jobs")
      .update({
        status,
        error_message: errorMessage
      })
      .eq("id", jobId);

    if (error) {
      logger.error(`Error updating render job ${jobId} in Supabase.`, error, "REPO-RENDER");
    }
  },

  async getRecentJobs(limit = 10): Promise<RenderJob[]> {
    if (env.isSupabaseMock) {
      return [...mockRenderJobs]
        .sort((a, b) => new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime())
        .slice(0, limit);
    }
    const { data, error } = await supabase!
      .from("render_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return error ? [] : data;
  },

  async cleanupOldJobs(daysToKeep = 7): Promise<void> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
    
    if (env.isSupabaseMock) {
      logger.info(`Cleaning up render jobs older than ${daysToKeep} days in memory.`, "REPO-RENDER");
      return;
    }

    logger.info(`Cleaning up render jobs older than ${daysToKeep} days in Supabase.`, "REPO-RENDER");
    const { error } = await supabase!
      .from("render_jobs")
      .delete()
      .lt("created_at", cutoffDate);

    if (error) {
      logger.error("Error cleaning up old render jobs.", error, "REPO-RENDER");
    }
  }
};

// ─── Schedule Entries ────────────────────────────────────────────────────────
export interface ScheduleEntry {
  id: string;
  label: string;    // e.g. "Bản tin sáng"
  time: string;     // "HH:MM" Vietnam time (UTC+7)
  enabled: boolean;
  created_at?: string;
}

let mockSchedules: ScheduleEntry[] = [
  { id: "sched-0600", label: "Bản tin sáng", time: "06:00", enabled: true },
  { id: "sched-1200", label: "Bản tin trưa", time: "12:00", enabled: false },
  { id: "sched-1800", label: "Bản tin tối",  time: "18:00", enabled: false },
];

export const ScheduleRepository = {
  async getAll(): Promise<ScheduleEntry[]> {
    if (env.isSupabaseMock) return [...mockSchedules];
    const { data, error } = await supabase!
      .from("schedules")
      .select("*")
      .order("time", { ascending: true });
    if (error) {
      logger.warn("Supabase schedules fetch failed, using in-memory.", "REPO-SCHEDULE");
      return [...mockSchedules];
    }
    return data as ScheduleEntry[];
  },

  async upsert(entry: ScheduleEntry): Promise<ScheduleEntry | null> {
    if (env.isSupabaseMock) {
      const idx = mockSchedules.findIndex(s => s.id === entry.id);
      if (idx >= 0) mockSchedules[idx] = entry;
      else mockSchedules.push(entry);
      return entry;
    }
    const { data, error } = await supabase!
      .from("schedules")
      .upsert(entry, { onConflict: "id" })
      .select()
      .single();
    if (error) {
      logger.error("Error upserting schedule entry.", error, "REPO-SCHEDULE");
      return null;
    }
    return data as ScheduleEntry;
  },

  async delete(id: string): Promise<void> {
    if (env.isSupabaseMock) {
      mockSchedules = mockSchedules.filter(s => s.id !== id);
      return;
    }
    const { error } = await supabase!.from("schedules").delete().eq("id", id);
    if (error) logger.error(`Error deleting schedule ${id}.`, error, "REPO-SCHEDULE");
  },
};
