import Parser from "rss-parser";
import { logger } from "./logger";

const parser = new Parser();

async function testRssImage() {
  const url = "https://vnexpress.net/rss/tin-noi-bat.rss";
  logger.info(`Fetching test feed from: ${url}`, "RSS-DEBUG");
  
  try {
    const feed = await parser.parseURL(url);
    if (!feed.items || feed.items.length === 0) {
      logger.error("No items found in feed!", undefined, "RSS-DEBUG");
      return;
    }
    
    const firstItem = feed.items[0];
    logger.info("--- KEYS OF THE PARSED ITEM ---", "RSS-DEBUG");
    console.log(Object.keys(firstItem));
    
    logger.info("--- FULL PARSED ITEM STRUCTURE ---", "RSS-DEBUG");
    console.dir(firstItem, { depth: null });
    
  } catch (err: any) {
    logger.error("Failed to parse feed", err, "RSS-DEBUG");
  }
}

testRssImage();
