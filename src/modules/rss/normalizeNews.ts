import { RawRssItem } from "./fetchRss";
import { NewsArticle } from "../database/repositories";
import { parseRssDate } from "../../utils/date";
import { logger } from "../../utils/logger";

/**
 * Strips HTML tags from a text string.
 */
export function stripHtmlTags(htmlStr?: string): string {
  if (!htmlStr) return "";
  // Strip tags like <img ... />, <br />, <a>...</a>
  let clean = htmlStr.replace(/<\/?[^>]+(>|$)/g, "");
  // Replace HTML entity representations (like &nbsp;, &quot;, &amp;, etc.)
  clean = clean
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
    
  return clean;
}

/**
 * Extracts a thumbnail image URL from an HTML content string.
 */
export function extractThumbnailUrl(content?: string): string {
  if (!content) return "";
  const match = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match && match[1] ? match[1] : "";
}

/**
 * Normalizes raw RSS feed items into unified NewsArticle entities.
 * Filters out items missing critical fields like Title or URL.
 */
export function normalizeRawNews(rawItems: RawRssItem[]): Omit<NewsArticle, "id">[] {
  logger.info(`Starting normalization for ${rawItems.length} raw articles...`, "RSS-NORMALIZE");
  
  const normalizedList: Omit<NewsArticle, "id">[] = [];
  
  for (const item of rawItems) {
    if (!item.title || !item.link) {
      logger.debug("Skipping feed item missing title or link.", "RSS-NORMALIZE");
      continue;
    }
    
    // Extract thumbnail URL before stripping tags!
    const thumbnailUrl = extractThumbnailUrl(item.content || item.contentSnippet || "");
    
    // Clean Description & Content
    const cleanDesc = stripHtmlTags(item.contentSnippet || item.content || "");
    const cleanContent = stripHtmlTags(item.content || item.contentSnippet || "");
    const cleanTitle = stripHtmlTags(item.title);
    
    normalizedList.push({
      source_id: item.sourceId,
      title: cleanTitle,
      description: cleanDesc,
      content: cleanContent,
      url: item.link,
      pub_date: parseRssDate(item.pubDate),
      guid: item.guid,
      normalized_title: cleanTitle.toLowerCase(),
      normalized_content: cleanDesc.toLowerCase(),
      score: 0,
      is_ranked: false,
      summary: "",
      thumbnail_url: thumbnailUrl
    });
  }
  
  logger.success(`Normalization complete. Generated ${normalizedList.length} unified articles.`, "RSS-NORMALIZE");
  return normalizedList;
}
