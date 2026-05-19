import fs from "fs";
import path from "path";
import axios from "axios";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

export interface TikTokUploadResult {
  publishId: string;
  shareUrl?: string;
  isMock: boolean;
}

/**
 * Automatically uploads a compiled MP4 video to TikTok using Content Posting API v2
 * @param videoPath Absolute local path to the compiled MP4 video
 * @param title Caption for the TikTok video (hashtags, description, etc.)
 */
export async function postVideoToTikTok(videoPath: string, title: string): Promise<TikTokUploadResult> {
  const videoName = path.basename(videoPath);
  
  if (!fs.existsSync(videoPath)) {
    throw new Error(`TikTok Upload Error: Local video file not found at: ${videoPath}`);
  }

  const fileStats = fs.statSync(videoPath);
  const videoSize = fileStats.size;

  logger.info(`Preparing TikTok publication for video: "${videoName}" (${(videoSize / 1024 / 1024).toFixed(2)} MB)`, "TIKTOK-PUB");

  // Fallback to MOCK mode if credentials are not fully configured
  if (env.isTiktokMock) {
    logger.info("--------------------------------------------------", "TIKTOK-MOCK");
    logger.info("[MOCK] Initializing publishing session on TikTok...", "TIKTOK-MOCK");
    logger.info(`[MOCK] Payload Metadata:`, "TIKTOK-MOCK");
    logger.info(`  - Caption: "${title}"`, "TIKTOK-MOCK");
    logger.info(`  - Video Size: ${videoSize} bytes`, "TIKTOK-MOCK");
    logger.info(`  - Privacy: PUBLIC_TO_EVERYONE`, "TIKTOK-MOCK");
    
    // Simulate API network delays
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    logger.info(`[MOCK] Uploading video binary to pre-signed upload URL...`, "TIKTOK-MOCK");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    logger.success("[MOCK] Video uploaded successfully to TikTok Sandbox!", "TIKTOK-MOCK");
    logger.success(`[MOCK] Created post Publish ID: mock_pub_${Date.now()}`, "TIKTOK-MOCK");
    logger.info("--------------------------------------------------", "TIKTOK-MOCK");

    return {
      publishId: `mock_pub_${Date.now()}`,
      shareUrl: "https://www.tiktok.com/@whatnew_ai/video/mock_sandbox_video_id",
      isMock: true
    };
  }

  // --- LIVE TIKTOK DIRECT POST IMPLEMENTATION (API V2) ---
  try {
    const accessToken = env.tiktokAccessToken;

    logger.info("Initializing live TikTok publish session via API v2...", "TIKTOK-PUB");

    // Step 1: Initialize the upload with TikTok v2 endpoint
    // Endpoint: https://open.tiktokapis.com/v2/post/publish/video/init/
    const initResponse = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        post_info: {
          title: title,
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_stitch: false,
          disable_comment: false,
          video_cover_timestamp_ms: 1000
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoSize,
          chunk_size: videoSize,
          total_chunk_count: 1
        }
      },
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8"
        }
      }
    );

    const resData = initResponse.data;
    if (resData.error && resData.error.code !== "ok") {
      throw new Error(`Direct Post Initialization failed: [${resData.error.code}] ${resData.error.message}`);
    }

    const publishId = resData.data?.publish_id;
    const uploadUrl = resData.data?.upload_url;

    if (!publishId || !uploadUrl) {
      throw new Error("Invalid response received from TikTok video init: missing publish_id or upload_url.");
    }

    logger.info(`Upload initialized. Publish ID: ${publishId}. Streaming video binary to upload URL...`, "TIKTOK-PUB");

    // Step 2: Upload video binary to the pre-signed URL via PUT request
    const videoStream = fs.createReadStream(videoPath);
    
    await axios.put(uploadUrl, videoStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    logger.success("Video binary streamed successfully to TikTok servers!", "TIKTOK-PUB");
    logger.success(`TikTok post created successfully! Publish ID: ${publishId}`, "TIKTOK-PUB");

    // Since TikTok processes videos asynchronously, we point the user to their creator center
    return {
      publishId,
      shareUrl: "https://www.tiktok.com/creator-center",
      isMock: false
    };

  } catch (error: any) {
    logger.error("Failed to automatically post video to TikTok!", error, "TIKTOK-PUB");
    if (error.response?.data) {
      logger.error(`TikTok Response Error Data: ${JSON.stringify(error.response.data)}`, "TIKTOK-PUB");
    }
    throw error;
  }
}
