import { NewsArticle } from "../database/repositories";
import { genAI, MODEL_NAME } from "./geminiClient";
import env from "../../config/env";
import { logger } from "../../utils/logger";
import { cleanAndParseJSON } from "../../utils/json";

interface RankedItem {
  id: string;
  score: number;
  reason: string;
}

/**
 * Uses Gemini API to rank and select the Top N articles for a specific Vietnamese category.
 */
export async function rankNewsByCategory(
  articles: NewsArticle[],
  categoryVi: string,
  topN: number = 10,
  sourceMap?: Record<string, string>  // sourceId → sourceName
): Promise<NewsArticle[]> {
  logger.info(`Ranking ${articles.length} articles for category [${categoryVi}]...`, "AI-RANK");

  if (articles.length === 0) return [];

  const candidates = articles.slice(0, 100);

  if (env.isGeminiMock) {
    logger.info(`Running Gemini Mock Ranking for [${categoryVi}]...`, "AI-RANK");
    return candidates.slice(0, topN).map((art, index) => ({
      ...art,
      score: 100 - index * 8,
      is_ranked: true
    }));
  }

  const formattedCandidates = candidates.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description || "",
    source: (sourceMap && c.source_id && sourceMap[c.source_id]) ? sourceMap[c.source_id] : (c.source_id || "Chung")
  }));

  const prompt = `Bạn là biên tập viên tin tức chuyên về mảng "${categoryVi}". Dưới đây là danh sách các bài viết tin tức dưới dạng JSON:

${JSON.stringify(formattedCandidates, null, 2)}

Nhiệm vụ của bạn:
1. Chỉ chọn ra ĐÚNG tối đa ${topN} tin tức thuộc chủ đề "${categoryVi}" quan trọng và nổi bật nhất.
2. Nếu một tin không liên quan đến "${categoryVi}", KHÔNG được chọn.
3. Chấm điểm cho từng tin được chọn trên thang điểm 100.
4. Trả về kết quả dưới dạng mảng JSON:
[
  {
    "id": "id_cua_tin_tuc",
    "score": 95,
    "reason": "Lý do ngắn gọn bằng tiếng Việt."
  }
]

CHÚ Ý: Chỉ trả về JSON hợp lệ, không có Markdown hay ký tự dư thừa.`;

  try {
    const model = genAI!.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: { responseMimeType: "application/json" }
    });

    logger.info(`Sending category ranking request to Gemini API for [${categoryVi}]...`, "AI-RANK");
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    const rankedList: RankedItem[] = cleanAndParseJSON<RankedItem[]>(responseText);

    if (!Array.isArray(rankedList)) {
      throw new Error("Gemini response is not a JSON array.");
    }

    const rankedArticles: NewsArticle[] = [];
    for (const item of rankedList) {
      const original = candidates.find((c) => c.id === item.id);
      if (original) {
        rankedArticles.push({ ...original, score: item.score, is_ranked: true });
      }
    }

    const sorted = rankedArticles.sort((a, b) => (b.score || 0) - (a.score || 0));
    logger.success(`Category [${categoryVi}]: Ranked ${sorted.length} articles. Slicing to top ${topN}.`, "AI-RANK");
    return sorted.slice(0, topN);
  } catch (error: any) {
    logger.error(`Error ranking for category [${categoryVi}]. Falling back to rule-based sorting.`, error, "AI-RANK");
    return candidates.slice(0, topN).map((art, index) => ({
      ...art,
      score: 100 - index * 8,
      is_ranked: true
    }));
  }
}

/**
 * Uses Gemini API to select and rank the Top 20 most hot/important articles from the list.
 */
export async function rankNewsArticles(articles: NewsArticle[]): Promise<NewsArticle[]> {
  logger.info(`Ranking ${articles.length} news articles...`, "AI-RANK");
  
  if (articles.length === 0) return [];
  
  // If we have less than or equal to 20 articles, no need to truncate, but we still want to rank them.
  // Limit candidates to 70 to optimize Gemini token usage and guarantee high-quality analysis.
  const candidates = articles.slice(0, 70);
  
  if (env.isGeminiMock) {
    logger.info("Running Gemini Mock Ranking...", "AI-RANK");
    // Just take up to 20 of the pre-scored articles and assign mock ratings
    const top20 = candidates.slice(0, 20);
    return top20.map((art, index) => ({
      ...art,
      score: 100 - index * 4,
      is_ranked: true
    }));
  }
  
  const formattedCandidates = candidates.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description || "",
    category: c.source_id || "Chung"
  }));
  
  const prompt = `Bạn là biên tập viên tin tức hàng đầu. Dưới đây là danh sách các bài viết tin tức ngày hôm nay dưới dạng JSON:
  
${JSON.stringify(formattedCandidates, null, 2)}

Nhiệm vụ của bạn:
1. Đánh giá tất cả các tin tức trên dựa trên giá trị tin tức (mức độ nóng hổi, tác động xã hội, tầm quan trọng toàn cầu/quốc gia, tính thời sự).
2. Lựa chọn ra đúng tối đa 20 tin tức quan trọng và nổi bật nhất ngày hôm nay.
3. Chấm điểm cho từng tin được chọn trên thang điểm 100 (100 là quan trọng nhất, giảm dần).
4. Viết một lý do ngắn gọn (1 câu tiếng Việt) giải thích tại sao tin này được chọn.
5. Trả về kết quả dưới dạng một mảng JSON các đối tượng có cấu trúc chính xác như sau:
[
  {
    "id": "id_cua_tin_tuc",
    "score": 95,
    "reason": "Giải thích ngắn gọn lý do chọn tin tức này."
  }
]

CHÚ Ý: Chỉ trả về chuỗi JSON hợp lệ, không kèm theo lời mở đầu, Markdown block \`\`\`json hay bất kỳ ký tự dư thừa nào ngoài JSON.`;

  try {
    const model = genAI!.getGenerativeModel({ 
      model: MODEL_NAME,
      generationConfig: { responseMimeType: "application/json" }
    });
    
    logger.info("Sending ranking request to Gemini API...", "AI-RANK");
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    logger.debug(`Gemini response: ${responseText}`, "AI-RANK");
    
    // Parse JSON safely using our robust utility
    const rankedList: RankedItem[] = cleanAndParseJSON<RankedItem[]>(responseText);
    
    if (!Array.isArray(rankedList)) {
      throw new Error("Gemini response is not a JSON array.");
    }
    
    // Map scores and reasons back to original articles
    const rankedArticles: NewsArticle[] = [];
    
    for (const item of rankedList) {
      const original = candidates.find((c) => c.id === item.id);
      if (original) {
        rankedArticles.push({
          ...original,
          score: item.score,
          is_ranked: true
          // We can append reason if needed, but summary will hold the actual card body
        });
      }
    }
    
    // Sort articles by the AI score descending
    const sortedRanked = rankedArticles.sort((a, b) => (b.score || 0) - (a.score || 0));
    
    logger.success(`Gemini ranked and selected ${sortedRanked.length} hot news articles. (Top 20 Sliced)`, "AI-RANK");
    return sortedRanked.slice(0, 20);
  } catch (error: any) {
    logger.error("Error during Gemini news ranking. Falling back to rule-based sorting.", error, "AI-RANK");
    
    // Recovery path: use pre-scored sorting
    const top20 = candidates.slice(0, 20);
    return top20.map((art, index) => ({
      ...art,
      score: 100 - index * 4,
      is_ranked: true
    }));
  }
}
