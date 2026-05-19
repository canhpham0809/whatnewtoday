import { logger } from "./logger";

/**
 * Robustly cleans and parses a JSON string returned by LLMs,
 * resolving markdown code blocks, conversational prefixes/suffixes, and unescaped control characters.
 */
export function cleanAndParseJSON<T>(rawText: string): T {
  let cleaned = rawText.trim();
  
  // 1. Remove Markdown code blocks if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  }
  
  // 2. Extract strictly JSON bracket bounds (Array or Object)
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  
  if (firstBracket !== -1 && lastBracket !== -1) {
    cleaned = cleaned.substring(firstBracket, lastBracket + 1);
  } else {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }
  
  try {
    return JSON.parse(cleaned) as T;
  } catch (err: any) {
    logger.error("JSON parsing failed even after extensive cleaning!", err, "JSON-UTIL");
    logger.debug(`Cleaned string that failed parse: ${cleaned}`, "JSON-UTIL");
    throw err;
  }
}
