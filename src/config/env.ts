import dotenv from "dotenv";
import path from "path";
import { logger } from "../utils/logger";

// Load environment variables from .env file
dotenv.config();

export interface Config {
  geminiApiKey: string;
  isGeminiMock: boolean;
  
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  isSupabaseMock: boolean;
  
  googleClientEmail: string;
  googlePrivateKey: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken: string;
  googleDriveFolderId: string;
  isDriveMock: boolean;

  tiktokClientKey: string;
  tiktokClientSecret: string;
  tiktokAccessToken: string;
  tiktokRefreshToken: string;
  isTiktokMock: boolean;
  
  cronTime: string;
  nodeEnv: string;

  bufferApiKey: string;
  bufferTiktokChannelId: string;
}

function getEnv(key: string, defaultValue = ""): string {
  return process.env[key] || defaultValue;
}

// Parse Google Private Key (handle escaped newlines)
function parsePrivateKey(key: string): string {
  if (!key) return "";
  // If the key is surrounded by quotes, remove them
  let cleaned = key.trim();
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.substring(1, cleaned.length - 1);
  }
  // Replace escaped literal \n with real newline characters
  return cleaned.replace(/\\n/g, "\n");
}

const hasServiceAccount = getEnv("GOOGLE_CLIENT_EMAIL") && getEnv("GOOGLE_PRIVATE_KEY");
const hasOAuth2 = getEnv("GOOGLE_CLIENT_ID") && getEnv("GOOGLE_CLIENT_SECRET") && getEnv("GOOGLE_REFRESH_TOKEN");
const hasFolder = getEnv("GOOGLE_DRIVE_FOLDER_ID");

export const env: Config = {
  geminiApiKey: getEnv("GEMINI_API_KEY"),
  isGeminiMock: !getEnv("GEMINI_API_KEY"),
  
  supabaseUrl: getEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  isSupabaseMock: !getEnv("SUPABASE_URL") || !getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  
  googleClientEmail: getEnv("GOOGLE_CLIENT_EMAIL"),
  googlePrivateKey: parsePrivateKey(getEnv("GOOGLE_PRIVATE_KEY")),
  googleClientId: getEnv("GOOGLE_CLIENT_ID"),
  googleClientSecret: getEnv("GOOGLE_CLIENT_SECRET"),
  googleRefreshToken: getEnv("GOOGLE_REFRESH_TOKEN"),
  googleDriveFolderId: getEnv("GOOGLE_DRIVE_FOLDER_ID"),
  isDriveMock: !(hasFolder && (hasServiceAccount || hasOAuth2)),

  tiktokClientKey: getEnv("TIKTOK_CLIENT_KEY"),
  tiktokClientSecret: getEnv("TIKTOK_CLIENT_SECRET"),
  tiktokAccessToken: getEnv("TIKTOK_ACCESS_TOKEN"),
  tiktokRefreshToken: getEnv("TIKTOK_REFRESH_TOKEN"),
  isTiktokMock: !getEnv("TIKTOK_ACCESS_TOKEN"),
  
  cronTime: getEnv("CRON_TIME", "0 8 * * *"),
  nodeEnv: getEnv("NODE_ENV", "development"),

  bufferApiKey: getEnv("BUFFER_API_KEY"),
  bufferTiktokChannelId: getEnv("BUFFER_TIKTOK_CHANNEL_ID")
};

// Log warning details about fallback modes if credentials are not configured
export function checkConfigAndLogWarnings(): void {
  logger.info("Initializing system configurations...", "CONFIG");
  
  if (env.isGeminiMock) {
    logger.warn("GEMINI_API_KEY is missing! Using Mock Gemini Service (fallback content will be generated).", "CONFIG");
  } else {
    logger.success("Gemini API credentials loaded successfully.", "CONFIG");
  }
  
  if (env.isSupabaseMock) {
    logger.warn("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing! Using Mock Database (in-memory state will be used).", "CONFIG");
  } else {
    logger.success("Supabase Database configuration loaded successfully.", "CONFIG");
  }
  
  if (env.isDriveMock) {
    logger.warn("GOOGLE_DRIVE_FOLDER_ID or Google credentials missing! Using Mock Google Drive (files saved locally in output/ only).", "CONFIG");
  } else {
    const method = hasOAuth2 ? "OAuth 2.0 (Gmail 5TB Account)" : "Service Account JSON";
    logger.success(`Google Drive API configuration loaded successfully. Mode: ${method}`, "CONFIG");
  }

  if (env.isTiktokMock) {
    logger.warn("TIKTOK_ACCESS_TOKEN is missing! Using Mock TikTok publisher (posting steps will be logged only).", "CONFIG");
  } else {
    logger.success("TikTok Creator API credentials loaded successfully. Live publishing enabled!", "CONFIG");
  }

  if (!env.bufferApiKey || !env.bufferTiktokChannelId) {
    logger.warn("BUFFER_API_KEY or BUFFER_TIKTOK_CHANNEL_ID is missing! Buffer Auto-Publishing is disabled.", "CONFIG");
  } else {
    logger.success("Buffer API credentials loaded successfully. TikTok photo carousels enabled!", "CONFIG");
  }
}
export default env;
