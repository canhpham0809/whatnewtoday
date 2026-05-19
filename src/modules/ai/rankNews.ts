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
 * Uses Gemini API to select and rank the Top 20 most hot/important articles from the list.
 */
export async function rankNewsArticles(articles: NewsArticle[]): Promise<NewsArticle[]> {
  logger.info(`Ranking ${articles.length} news articles...`, "AI-RANK");
  
  if (articles.length === 0) return [];
  
  // If we have less than or equal to 20 articles, no need to truncate, but we still want to rank them.
  // Limit candidates to 50 to optimize Gemini token usage and guarantee high-quality analysis.
  const candidates = articles.slice(0, 50);
  
  if (env.isGeminiMock) {
    logger.info("Running Gemini Mock Ranking...", "AI-RANK");
    // Just take up to 10 of the pre-scored articles and assign mock ratings
    const top10 = candidates.slice(0, 10);
    return top10.map((art, index) => ({
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
2. Lựa chọn ra đúng tối đa 10 tin tức quan trọng và nổi bật nhất ngày hôm nay.
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
    
    logger.success(`Gemini ranked and selected ${sortedRanked.length} hot news articles. (Top 10 Sliced)`, "AI-RANK");
    return sortedRanked.slice(0, 10);
  } catch (error: any) {
    logger.error("Error during Gemini news ranking. Falling back to rule-based sorting.", error, "AI-RANK");
    
    // Recovery path: use pre-scored sorting
    const top10 = candidates.slice(0, 10);
    return top10.map((art, index) => ({
      ...art,
      score: 100 - index * 4,
      is_ranked: true
    }));
  }
}
