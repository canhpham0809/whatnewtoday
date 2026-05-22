import { NewsArticle } from "../database/repositories";
import { logger } from "../../utils/logger";

// High-impact keywords in Vietnamese news to rank importance
const HOT_KEYWORDS = [
  "khẩn", "nóng", "đột phá", "quan trọng", "chính thức", "bắt giam", "khởi tố",
  "hỏa hoạn", "cháy", "tai nạn", "tử vong", "thiệt hại", "bão", "lũ", "thiên tai",
  "thủ tướng", "chủ tịch nước", "quốc hội", "chính phủ", "đại hội",
  "tăng trưởng", "lạm phát", "ngân hàng", "tỉ giá", "vàng", "bất động sản",
  "công nghệ", "ai", "gemini", "nvidia", "apple", "microsoft", "kỷ lục",
  "việt nam", "vneconomy", "đại sứ"
];

// Low-impact keywords that might be local/ads or low general news value
const SPAM_KEYWORDS = [
  "rao vặt", "tuyển dụng", "mua bán", "khuyến mãi", "ưu đãi", "giảm giá",
  "giá rẻ", "tử vi", "bói toán", "showbiz", "drama", "scandal", "đoán vận"
];

/**
 * Computes a raw hotness score for news articles based on keywords and metadata.
 */
export function scoreArticles(articles: NewsArticle[]): NewsArticle[] {
  logger.info(`Pre-scoring ${articles.length} articles to optimize AI input...`, "NEWS-SCORE");
  
  const scored = articles.map((art) => {
    let score = 0;
    const title = art.title.toLowerCase();
    const description = (art.description || "").toLowerCase();
    
    // 1. Keyword Boosting
    for (const kw of HOT_KEYWORDS) {
      if (title.includes(kw)) score += 15;
      else if (description.includes(kw)) score += 5;
    }
    
    // 2. Spam Penalizing
    for (const spam of SPAM_KEYWORDS) {
      if (title.includes(spam)) score -= 25;
      else if (description.includes(spam)) score -= 10;
    }
    
    // 3. Recency & Source Boosting
    const ageHrs = (Date.now() - art.pub_date.getTime()) / (1000 * 60 * 60);
    const isVnExpress = (art.url || "").toLowerCase().includes("vnexpress.net");
    
    if (isVnExpress) {
      if (ageHrs <= 12) {
        score += 60; // Huge boost for fresh VnExpress articles
      } else if (ageHrs <= 24) {
        score += 10; // Moderate boost for recent VnExpress
      } else {
        score -= 30; // Heavy penalty for old VnExpress so fresh alternative sources win
      }
    } else {
      // Other sources (Thanh Niên, 24h, etc.)
      if (ageHrs <= 12) {
        score += 30; // Strong boost for fresh other sources (beats old VnExpress)
      } else if (ageHrs > 24) {
        score -= 15; // De-prioritize older articles
      }
    }
    
    // 4. Content length checks
    if (title.split(/\s+/).length < 5) score -= 10; // title too short
    if (!art.description || art.description.length < 20) score -= 10; // description missing or short
    
    return { ...art, score };
  });
  
  // Sort descending by score
  const sorted = scored.sort((a, b) => (b.score || 0) - (a.score || 0));
  
  logger.success("Article scoring completed.", "NEWS-SCORE");
  return sorted;
}
