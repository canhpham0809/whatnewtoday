import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { logger } from "../../utils/logger";
import { PipelineTracker } from "../../utils/pipelineTracker";
import { RenderJobRepository, VideoHistoryRepository, ScheduleRepository, ScheduleEntry } from "../database/repositories";
import { runWorkflow, runTopicWorkflow } from "../../main";
import { initScheduleManager, reloadSchedule, removeSchedule, setExternalWorkflowRunning } from "../scheduler/scheduleManager";

let PORT = Number(process.env.PORT) || 3000;
let isWorkflowRunning = false;

// Global trigger executor to run main.ts pipeline safely
async function executeWorkflowAsync() {
  if (isWorkflowRunning) return;
  isWorkflowRunning = true;
  setExternalWorkflowRunning(true);
  logger.info("Pipeline manual execution triggered via Dashboard API.", "DASHBOARD-SERVER");
  try {
    await runWorkflow();
  } catch (err) {
    logger.error("Error in background pipeline manual run", err, "DASHBOARD-SERVER");
  } finally {
    isWorkflowRunning = false;
    setExternalWorkflowRunning(false);
  }
}

// Single-topic trigger executor
async function executeTopicAsync(topicKey: string) {
  if (isWorkflowRunning) return;
  isWorkflowRunning = true;
  setExternalWorkflowRunning(true);
  logger.info(`Single-topic run triggered via Dashboard: ${topicKey}`, "DASHBOARD-SERVER");
  try {
    await runTopicWorkflow(topicKey);
  } catch (err) {
    logger.error(`Error in single-topic run for ${topicKey}`, err, "DASHBOARD-SERVER");
  } finally {
    isWorkflowRunning = false;
    setExternalWorkflowRunning(false);
  }
}

const server = http.createServer(async (req, res) => {
  const url = req.url || "/";
  const method = req.method || "GET";

  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Endpoint: Get real-time pipeline status
  if (url === "/api/status" && method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    const progress = PipelineTracker.getProgress();
    res.end(JSON.stringify({
      ...progress,
      isSystemRunning: isWorkflowRunning
    }));
    return;
  }

  // API Endpoint: Get execution history
  if (url === "/api/jobs" && method === "GET") {
    try {
      const [jobs, history] = await Promise.all([
        RenderJobRepository.getRecentJobs(15),
        VideoHistoryRepository.getRecentHistory(15)
      ]);

      // Merge render jobs with video histories on matching ids or order
      const mergedJobs = jobs.map((job) => {
        // Find matching history
        const matchedVideo = history.find(
          (h) => h.id === job.video_id || (h.video_title && h.created_at && job.created_at && Math.abs(new Date(h.created_at).getTime() - new Date(job.created_at).getTime()) < 1800000)
        );

        return {
          id: job.id,
          status: job.status,
          error_message: job.error_message,
          created_at: job.created_at,
          video_title: matchedVideo ? matchedVideo.video_title : "Bản Tin Sáng",
          drive_url: matchedVideo ? matchedVideo.drive_url : undefined,
          drive_file_id: matchedVideo ? matchedVideo.drive_file_id : undefined,
          tiktok_publish_id: matchedVideo?.meta_data?.tiktok_publish_id || "N/A",
          tiktok_url: matchedVideo?.meta_data?.tiktok_url || "N/A",
          total_articles: matchedVideo?.meta_data?.total_articles || 0
        };
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(mergedJobs));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message || String(err) }));
    }
    return;
  }

  // API Endpoint: Manually trigger runWorkflow
  if (url === "/api/trigger" && method === "POST") {
    if (isWorkflowRunning) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: "Hệ thống đang chạy một tiến trình biên dịch khác!" }));
      return;
    }
    executeWorkflowAsync();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "Khởi động luồng sinh video thành công!" }));
    return;
  }

  // API Endpoint: Trigger a SINGLE topic workflow
  if (url === "/api/trigger-topic" && method === "POST") {
    if (isWorkflowRunning) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: "Hệ thống đang chạy. Vui lòng đợi hoàn thành trước!" }));
      return;
    }
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const { topicKey } = JSON.parse(body);
        if (!topicKey) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, message: "Thiếu tham số topicKey!" }));
          return;
        }
        executeTopicAsync(topicKey);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: `✅ Đã khởi động chạy riêng chủ đề: ${topicKey}` }));
      } catch (err: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, message: `Lỗi parse request: ${err.message}` }));
      }
    });
    return;
  }

  // API Endpoint: Get all schedules
  if (url === "/api/schedules" && method === "GET") {
    try {
      const schedules = await ScheduleRepository.getAll();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(schedules));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API Endpoint: Create or update a schedule
  if (url === "/api/schedules" && method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const entry: ScheduleEntry = JSON.parse(body);
        if (!entry.id) entry.id = `sched-${Date.now()}`;
        const saved = await ScheduleRepository.upsert(entry);
        reloadSchedule(entry);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(saved));
      } catch (err: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API Endpoint: Delete a schedule by id
  if (url.startsWith("/api/schedules/") && method === "DELETE") {
    const id = url.replace("/api/schedules/", "");
    try {
      await ScheduleRepository.delete(id);
      removeSchedule(id);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Serve Main Web Dashboard SPA (Single Page Application)
  if (url === "/" || url === "/index.html") {
    try {
      const htmlPath = path.resolve(__dirname, "./index.html");
      const html = fs.readFileSync(htmlPath, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (readErr: any) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Internal Error: Failed to read dashboard UI. ${readErr.message}`);
    }
    return;
  }

  // Handle 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint not found" }));
});

// Start Server with resilient dynamic fallback if port is in use
function startServer(currentPort: number) {
  server.listen(currentPort, async () => {
    logger.success("==================================================", "DASHBOARD");
    logger.success(`DASHBOARD ONLINE AND RUNNING AT http://localhost:${currentPort}`, "DASHBOARD");
    logger.success("==================================================", "DASHBOARD");
    // Initialize dynamic schedule manager after server starts
    await initScheduleManager();
  });
}

server.on("error", (err: any) => {
  if (err.code === "EADDRINUSE") {
    logger.warn(`Cổng ${PORT} đã bị chiếm dụng. Đang tự động thử cổng tiếp theo...`, "DASHBOARD");
    PORT = PORT + 1;
    setTimeout(() => {
      startServer(PORT);
    }, 500);
  } else {
    logger.error("Dashboard server error", err, "DASHBOARD");
  }
});

startServer(PORT);

export { server };
