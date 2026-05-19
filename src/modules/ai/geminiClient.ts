import { GoogleGenerativeAI } from "@google/generative-ai";
import env from "../../config/env";
import { logger } from "../../utils/logger";

let genAI: GoogleGenerativeAI | null = null;
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!env.isGeminiMock) {
  try {
    genAI = new GoogleGenerativeAI(env.geminiApiKey);
    logger.info(`Gemini API client initialized. Selected Model: ${MODEL_NAME}`, "AI-CLIENT");
  } catch (err) {
    logger.error("Failed to initialize Gemini Client. Forcing Mock mode.", err, "AI-CLIENT");
    env.isGeminiMock = true;
  }
}

export { genAI, MODEL_NAME };
