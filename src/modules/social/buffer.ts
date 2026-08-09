import axios from "axios";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

export interface BufferPostResult {
  updateId: string;
  shareUrl?: string;
  isMock: boolean;
}

/**
 * Automatically posts/schedules a video or multi-image carousel to Buffer connected profiles
 * @param caption Text caption for the post (including hashtags)
 * @param mediaUrls Optional single public URL or array of image/video URLs
 */
export async function postVideoToBuffer(caption: string, mediaUrls?: string | string[]): Promise<BufferPostResult> {
  logger.info(`Preparing Buffer Social Publish for profile: "${env.bufferProfileId || 'MOCK'}"`, "BUFFER-PUB");

  // Fallback to MOCK mode if credentials are not configured
  if (env.isBufferMock) {
    const totalMedia = Array.isArray(mediaUrls) ? mediaUrls.length : (mediaUrls ? 1 : 0);
    logger.info("--------------------------------------------------", "BUFFER-MOCK");
    logger.info("[MOCK] Initializing publishing session on Buffer API...", "BUFFER-MOCK");
    logger.info(`[MOCK] Payload Metadata:`, "BUFFER-MOCK");
    logger.info(`  - Caption: "${caption}"`, "BUFFER-MOCK");
    logger.info(`  - Total Media Assets: ${totalMedia}`, "BUFFER-MOCK");
    
    // Simulate API network delays
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    logger.success("[MOCK] Video/Carousel update created successfully on Buffer!", "BUFFER-MOCK");
    logger.success(`[MOCK] Buffer Update ID: mock_buffer_${Date.now()}`, "BUFFER-MOCK");
    logger.info("--------------------------------------------------", "BUFFER-MOCK");

    return {
      updateId: `mock_buffer_${Date.now()}`,
      shareUrl: "https://publish.buffer.com/",
      isMock: true
    };
  }

  // --- LIVE BUFFER API IMPLEMENTATION ---
  try {
    logger.info("Sending post update request to Buffer API...", "BUFFER-PUB");

    // Build GraphQL assets array (TikTok limits photo carousels to max 10 images)
    let assetsList: any[] = [];
    if (Array.isArray(mediaUrls)) {
      for (const url of mediaUrls) {
        if (url && typeof url === "string" && url.startsWith("http")) {
          assetsList.push({ image: { url } });
        }
      }
    } else if (typeof mediaUrls === "string" && mediaUrls.startsWith("http")) {
      if (mediaUrls.endsWith(".mp4") || mediaUrls.includes("video")) {
        assetsList.push({ video: { url: mediaUrls } });
      } else {
        assetsList.push({ image: { url: mediaUrls } });
      }
    }

    if (assetsList.length > 10) {
      logger.info(`TikTok supports up to 10 photos per carousel. Slicing ${assetsList.length} slide images down to 10.`, "BUFFER-PUB");
      assetsList = assetsList.slice(0, 10);
    }

    // Buffer GraphQL API (v2). Do not fall back to the legacy REST endpoint:
    // it cannot represent a multi-image carousel and would treat an image as a video.
    {
      const inputObj: any = {
        channelId: env.bufferProfileId,
        text: caption,
        mode: "shareNow",
        schedulingType: "automatic",
        assets: assetsList.length > 0 ? assetsList : undefined
      };

      const graphqlQuery = {
        query: `
          mutation CreatePost($input: CreatePostInput!) {
            createPost(input: $input) {
              __typename
              ... on PostActionSuccess {
                post {
                  id
                }
              }
              ... on MutationError {
                message
              }
            }
          }
        `,
        variables: {
          input: inputObj
        }
      };

      let attempt = 0;
      let lastError: any = null;

      while (attempt < 3) {
        attempt++;
        try {
          logger.info(`Sending post update request to Buffer API (Attempt ${attempt}/3)...`, "BUFFER-PUB");
          const gqlResponse = await axios.post("https://api.buffer.com/graphql", graphqlQuery, {
            headers: {
              "Authorization": `Bearer ${env.bufferAccessToken}`,
              "Content-Type": "application/json"
            },
            timeout: 60000
          });

          const resData = gqlResponse.data;
          if (resData.errors && resData.errors.length > 0) {
            const errStr = resData.errors.map((e: any) => e.message).join(", ");
            throw new Error(`Buffer GraphQL API error: ${errStr}`);
          }

          const createRes = resData.data?.createPost;
          if (createRes?.__typename === "PostActionSuccess" && createRes.post?.id) {
            const updateId = createRes.post.id;
            logger.success(`Buffer update created successfully via GraphQL API! Update ID: ${updateId}`, "BUFFER-PUB");
            return { updateId, shareUrl: "https://publish.buffer.com/", isMock: false };
          } else if (createRes?.__typename === "InvalidInputError" || createRes?.__typename === "MutationError") {
            const msg = createRes.message || "Unknown error";
            lastError = new Error(`Buffer rejected post (${createRes.__typename}): ${msg}`);
            if (attempt < 3) {
              logger.warn(`⚠️ Buffer returned ${createRes.__typename} (Attempt ${attempt}/3): ${msg}. Retrying in 3.5s...`, "BUFFER-PUB");
              await new Promise(r => setTimeout(r, 3500));
              continue;
            }
          } else {
            lastError = new Error(`Unexpected Buffer createPost response: ${JSON.stringify(createRes || resData)}`);
          }
        } catch (err: any) {
          lastError = err;
          if (attempt < 3) {
            logger.warn(`⚠️ Buffer request attempt ${attempt}/3 failed (${err.message}). Retrying in 3.5s...`, "BUFFER-PUB");
            await new Promise(r => setTimeout(r, 3500));
          }
        }
      }

      throw lastError;
    }

  } catch (error: any) {
    const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || String(error);
    logger.warn(`[WARN] Buffer API publish encountered an issue: ${errorMsg}`, "BUFFER-PUB");
    logger.info("Mẹo: Nếu nhận lỗi 401/UNAUTHENTICATED, hãy kiểm tra xem BUFFER_ACCESS_TOKEN hoặc BUFFER_PROFILE_ID trong .env có chính xác không.", "BUFFER-PUB");
    if (error.response?.data) {
      logger.debug(`Buffer Error Response: ${JSON.stringify(error.response.data)}`, "BUFFER-PUB");
    }
    throw error;
  }
}
