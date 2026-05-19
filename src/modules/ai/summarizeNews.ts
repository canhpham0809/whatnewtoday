import { NewsArticle } from "../database/repositories";
import { genAI, MODEL_NAME } from "./geminiClient";
import env from "../../config/env";
import { logger } from "../../utils/logger";
import { cleanAndParseJSON } from "../../utils/json";

interface SummaryItem {
  id: string;
  summary: string;
}

/**
 * Generates mock Vietnamese summaries of 30-50 words based on article description.
 */
function generateMockSummary(description: string, title: string): string {
  const baseText = description || title || "Tin tức nổi bật trong ngày với nhiều diễn biến mới đáng chú ý.";
  const words = baseText.split(/\s+/);
  
  if (words.length >= 30 && words.length <= 50) {
    return baseText;
  }
  
  if (words.length > 50) {
    return words.slice(0, 45).join(" ") + "...";
  }
  
  // If too short, pad it nicely to reach 30+ words
  let padded = baseText;
  const paddingPhrases = [
    "Sự việc đang nhận được rất nhiều sự quan tâm từ dư luận xã hội.",
    "Các cơ quan chức năng đang khẩn trương vào cuộc để làm rõ nguyên nhân.",
    "Đây là thông tin cực kỳ quan trọng ảnh hưởng sâu sắc đến thị trường trong thời gian tới."
  ];
  
  let i = 0;
  while (padded.split(/\s+/).length < 35 && i < paddingPhrases.length) {
    padded += " " + paddingPhrases[i];
    i++;
  }
  
  return padded;
}

/**
 * Summarizes the selected articles using Gemini API in a single optimized batch request.
 */
export async function summarizeNewsArticles(articles: NewsArticle[]): Promise<NewsArticle[]> {
  logger.info(`Generating summaries for ${articles.length} articles...`, "AI-SUMMARIZE");
  
  if (articles.length === 0) return [];
  
  if (env.isGeminiMock) {
    logger.info("Running Gemini Mock Summarizer...", "AI-SUMMARIZE");
    return articles.map((art) => ({
      ...art,
      summary: generateMockSummary(art.description || "", art.title)
    }));
  }
  
  const formattedArticles = articles.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description || "",
    content: a.content || ""
  }));
  
  const prompt = `Bạn là biên tập viên viết bản tin video chuyên nghiệp. Dưới đây là danh sách ${articles.length} tin tức dạng JSON:

${JSON.stringify(formattedArticles, null, 2)}

Nhiệm vụ của bạn:
1. Viết một tóm tắt ngắn gọn cho mỗi tin tức bằng tiếng Việt.
2. Yêu cầu cực kỳ quan trọng: Mỗi tóm tắt BẮT BUỘC phải có độ dài từ 30 đến 50 từ (không ít hơn 30 từ, không nhiều hơn 50 từ).
3. Nội dung tóm tắt phải súc tích, thu hút người xem video, nêu bật được thông tin cốt lõi (Ai, Cái gì, Ở đâu, Khi nào, Tại sao). Không dùng từ ngữ sáo rỗng hoặc câu chào mừng.
4. Trả về kết quả dưới dạng một mảng JSON các đối tượng có cấu trúc chính xác như sau:
[
  {
    "id": "id_cua_tin_tuc",
    "summary": "Nội dung tóm tắt tiếng Việt từ 30 đến 50 từ."
  }
]

CHÚ Ý: Chỉ trả về chuỗi JSON hợp lệ, không kèm theo Markdown hay ký tự giải thích.`;

  try {
    const model = genAI!.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: { responseMimeType: "application/json" }
    });
    
    logger.info("Sending batch summarization request to Gemini API...", "AI-SUMMARIZE");
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    logger.debug(`Gemini response: ${responseText}`, "AI-SUMMARIZE");
    
    const summaryList: SummaryItem[] = cleanAndParseJSON<SummaryItem[]>(responseText);
    
    if (!Array.isArray(summaryList)) {
      throw new Error("Gemini response is not a JSON array.");
    }
    
    const summarizedArticles = articles.map((art) => {
      const match = summaryList.find((s) => s.id === art.id);
      return {
        ...art,
        summary: match ? match.summary : generateMockSummary(art.description || "", art.title)
      };
    });
    
    logger.success("Gemini batch summarization completed successfully.", "AI-SUMMARIZE");
    return summarizedArticles;
  } catch (error: any) {
    logger.error("Error during Gemini news batch summarization. Falling back to local mock summarizer.", error, "AI-SUMMARIZE");
    
    // Recovery path: local mock summary
    return articles.map((art) => ({
      ...art,
      summary: generateMockSummary(art.description || "", art.title)
    }));
  }
}
