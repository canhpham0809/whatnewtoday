import { NewsArticle } from "../database/repositories";
import { logger } from "../../utils/logger";

/**
 * Computes Jaccard Similarity between two strings of text based on words.
 */
function getJaccardSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(str2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Removes duplicate news items based on URL, exact title match, and title similarity.
 */
export function deduplicateNewsArticles(articles: NewsArticle[]): NewsArticle[] {
  logger.info(`Starting news deduplication for ${articles.length} articles...`, "DEDUPLICATE");
  
  if (articles.length <= 1) return articles;
  
  const uniqueArticles: NewsArticle[] = [];
  let urlDupCount = 0;
  let titleSimilarityDupCount = 0;
  
  // Sort articles by publication date descending (newest first)
  const sortedArticles = [...articles].sort((a, b) => b.pub_date.getTime() - a.pub_date.getTime());
  
  for (const item of sortedArticles) {
    // 1. Exact URL deduplication check
    const isUrlDup = uniqueArticles.some((ua) => ua.url === item.url);
    if (isUrlDup) {
      urlDupCount++;
      continue;
    }
    
    // 2. Similarity-based Title check
    let isSimilarityDup = false;
    for (const ua of uniqueArticles) {
      // Direct exact match
      if (ua.title.trim().toLowerCase() === item.title.trim().toLowerCase()) {
        isSimilarityDup = true;
        break;
      }
      
      // Token overlap Jaccard index
      const similarity = getJaccardSimilarity(ua.title, item.title);
      if (similarity > 0.6) {
        logger.debug(`Duplicate detected by similarity (${(similarity * 100).toFixed(1)}%): "${item.title}" VS "${ua.title}"`, "DEDUPLICATE");
        isSimilarityDup = true;
        break;
      }
    }
    
    if (isSimilarityDup) {
      titleSimilarityDupCount++;
      continue;
    }
    
    uniqueArticles.push(item);
  }
  
  logger.success(
    `Deduplication complete. Kept ${uniqueArticles.length}/${articles.length} articles. (Filtered: URL Duplicates: ${urlDupCount}, Title Similarity: ${titleSimilarityDupCount})`,
    "DEDUPLICATE"
  );
  
  return uniqueArticles;
}
