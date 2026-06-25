import axios from "axios";
import env from "../../config/env";
import { logger } from "../../utils/logger";

export interface BufferPostResult {
  success: boolean;
  postId?: string;
  error?: string;
}

const BUFFER_API_URL = "https://api.buffer.com";

/**
 * Automatically posts a photo carousel to TikTok using the Buffer GraphQL API.
 * @param title Caption for the TikTok video/carousel
 * @param publicImageUrls Array of publicly accessible image URLs
 */
export async function postCarouselToTikTok(
  title: string,
  publicImageUrls: string[]
): Promise<BufferPostResult> {
  if (!env.bufferApiKey || !env.bufferTiktokChannelId) {
    logger.warn("Buffer API credentials missing. Skipping TikTok Buffer upload.", "SOCIAL-BUFFER");
    return { success: false, error: "Missing Buffer credentials" };
  }

  if (!publicImageUrls || publicImageUrls.length === 0) {
    logger.warn("No public image URLs provided. Skipping TikTok Buffer upload.", "SOCIAL-BUFFER");
    return { success: false, error: "No image URLs provided" };
  }

  logger.info(`Preparing Buffer TikTok Carousel with ${publicImageUrls.length} images...`, "SOCIAL-BUFFER");

  const query = `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post {
            id
            text
          }
        }
        ... on MutationError {
          message
        }
      }
    }
  `;

  // Buffer API accepts up to 10 images for TikTok Carousels.
  // We keep the first 10 images (1 cover + 9 news slides) and omit the outro if there are more than 10.
  const MAX_IMAGES = 10;
  const urlsToPost = publicImageUrls.length > MAX_IMAGES 
    ? publicImageUrls.slice(0, MAX_IMAGES)
    : publicImageUrls;

  // Format the assets array for GraphQL
  const assets = urlsToPost.map((url) => ({
    image: { url }
  }));

    const variables = {
      input: {
        text: title,
        channelId: env.bufferTiktokChannelId,
        schedulingType: "automatic",
        mode: "shareNow",
        assets: assets
      }
    };

  try {
    const response = await axios.post(
      BUFFER_API_URL,
      { query, variables },
      {
        headers: {
          "Authorization": `Bearer ${env.bufferApiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    const result = response.data;

    if (result.errors) {
      logger.error("GraphQL Errors from Buffer:", JSON.stringify(result.errors), "SOCIAL-BUFFER");
      return { success: false, error: "GraphQL execution error" };
    }

    const mutationResult = result.data?.createPost;

    if (mutationResult?.message) {
      // It's a MutationError
      logger.error(`Buffer Mutation Error: ${mutationResult.message}`, "SOCIAL-BUFFER");
      return { success: false, error: mutationResult.message };
    }

    if (mutationResult?.post?.id) {
      logger.success(`Successfully queued TikTok carousel to Buffer! Post ID: ${mutationResult.post.id}`, "SOCIAL-BUFFER");
      return { success: true, postId: mutationResult.post.id };
    }

    return { success: false, error: "Unknown response structure" };
  } catch (error: any) {
    logger.error("Failed to post carousel to Buffer API.", error, "SOCIAL-BUFFER");
    if (error.response?.data) {
      logger.error(`Buffer Response Error Data: ${JSON.stringify(error.response.data)}`, "SOCIAL-BUFFER");
    }
    return { success: false, error: error.message };
  }
}
