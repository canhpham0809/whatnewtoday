import Parser from "rss-parser";
import { RssSource } from "../database/repositories";
import { logger } from "../../utils/logger";

const parser = new Parser({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  },
  timeout: 10000 // 10s timeout
});

export interface RawRssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  guid?: string;
  sourceId: string;
}

/**
 * Fetches RSS feed data from multiple active sources in parallel.
 * Gracefully handles individual feed failures without crashing the entire run.
 */
export async function fetchRssFeeds(sources: RssSource[]): Promise<RawRssItem[]> {
  logger.info(`Starting RSS fetch for ${sources.length} sources...`, "RSS-FETCH");
  
  const fetchPromises = sources.map(async (source) => {
    try {
      logger.info(`Fetching feed: ${source.name} (${source.url})`, "RSS-FETCH");
      const feed = await parser.parseURL(source.url);
      
      logger.success(`Fetched ${feed.items?.length || 0} items from ${source.name}`, "RSS-FETCH");
      
      return (feed.items || []).map((item) => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        contentSnippet: item.contentSnippet,
        content: item.content,
        guid: item.guid || item.link,
        sourceId: source.id
      }));
    } catch (error: any) {
      logger.error(`Failed to fetch RSS source '${source.name}' from ${source.url}`, error, "RSS-FETCH");
      return [];
    }
  });

  const results = await Promise.all(fetchPromises);
  const allItems = results.flat();
  
  logger.success(`RSS fetch completed. Total raw items parsed: ${allItems.length}`, "RSS-FETCH");
  return allItems;
}
