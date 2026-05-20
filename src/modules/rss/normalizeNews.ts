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
  const rawUrl = match && match[1] ? match[1] : "";
  return rawUrl ? upgradeImageUrl(rawUrl) : "";
}

/**
 * Upgrades a small/resized thumbnail URL to its full-resolution version.
 * Handles patterns from common Vietnamese news sources (thethao247, vnexpress, tuoitre, etc.)
 */
export function upgradeImageUrl(url: string): string {
  if (!url) return url;

  try {
    const u = new URL(url);
    const host = u.hostname; // e.g. "thethao247.vn"

    // ── thethao247.vn / cdn-img.thethao247.vn ────────────────────────────────
    if (host.includes("thethao247")) {
      let p = u.pathname;
      // ★ Primary CDN pattern: /resize_NNNxNNN// → /  (e.g. /resize_300x200//storage/files/...)
      p = p.replace(/^\/resize_\d+x\d+\/\//i, "/");
      // Also handle variant: /resize_NNN/
      p = p.replace(/^\/resize_\d+\/\//i, "/");
      // Also handle single-slash variant: /resize_NNNxNNN/
      p = p.replace(/^\/resize_\d+x\d+\//i, "/");
      // Strip path segment: /thumb/200x150/ → /
      p = p.replace(/\/thumb\/\d+x\d+\//i, "/");
      // Strip directory dimension: /200x150/ → /
      p = p.replace(/\/\d+x\d+\//g, "/");
      // Strip filename suffix dimension: filename_400x300.jpg → filename.jpg
      p = p.replace(/[_-]\d+x\d+(\.[a-z0-9]+)$/i, "$1");
      u.pathname = p;
      ["w", "width", "h", "height", "size", "resize", "quality", "q"].forEach(k => u.searchParams.delete(k));
      return u.toString();
    }

    // ── VnExpress ──────────────────────────────────────────────────────────────
    // Pattern: e.g. image1-200x150.jpg → image1.jpg (strip -WxH suffix before extension)
    if (host.includes("vnexpress") || host.includes("i-vnexpress")) {
      u.pathname = u.pathname.replace(/-\d+x\d+(\.[a-z]+)$/i, "$1");
      ["w", "width", "height", "h"].forEach(k => u.searchParams.delete(k));
      return u.toString();
    }

    // ── Tuổi Trẻ / Thanh Niên ─────────────────────────────────────────────────
    // Pattern: /resize/NNNx NNN/  or  -NNNx NNN. in filename
    if (host.includes("tuoitre") || host.includes("thanhnien") || host.includes("tienphong")) {
      u.pathname = u.pathname
        .replace(/\/resize\/\d+x\d+\//gi, "/")
        .replace(/-\d+x\d+(\.[a-z]+)$/i, "$1");
      ["w", "width", "h", "height"].forEach(k => u.searchParams.delete(k));
      return u.toString();
    }

    // ── Generic: remove common resize params ──────────────────────────────────
    ["w", "width", "h", "height", "size", "resize", "thumb"].forEach(k => u.searchParams.delete(k));
    return u.toString();

  } catch (_e) {
    // URL parse failed — return as-is
    return url;
  }
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
