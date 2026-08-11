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

  bufferAccessToken: string;
  bufferProfileId: string;
  isBufferMock: boolean;
  
  cronTime: string;
  nodeEnv: string;
}

function getEnv(key: string, defaultValue = ""): string {
  dotenv.config({ override: true });
  return process.env[key] || defaultValue;
}

function isConfigured(val: string): boolean {
  if (!val) return false;
  const trimmed = val.trim();
  return (
    trimmed !== "" &&
    !trimmed.startsWith("your_") &&
    !trimmed.endsWith("_here")
  );
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

export const env: Config = {
  get geminiApiKey() { return getEnv("GEMINI_API_KEY"); },
  get isGeminiMock() { return !isConfigured(getEnv("GEMINI_API_KEY")); },
  
  get supabaseUrl() { return getEnv("SUPABASE_URL"); },
  get supabaseServiceRoleKey() { return getEnv("SUPABASE_SERVICE_ROLE_KEY"); },
  get isSupabaseMock() { return !isConfigured(getEnv("SUPABASE_URL")) || !isConfigured(getEnv("SUPABASE_SERVICE_ROLE_KEY")); },
  
  get googleClientEmail() { return getEnv("GOOGLE_CLIENT_EMAIL"); },
  get googlePrivateKey() { return parsePrivateKey(getEnv("GOOGLE_PRIVATE_KEY")); },
  get googleClientId() { return getEnv("GOOGLE_CLIENT_ID"); },
  get googleClientSecret() { return getEnv("GOOGLE_CLIENT_SECRET"); },
  get googleRefreshToken() { return getEnv("GOOGLE_REFRESH_TOKEN"); },
  get googleDriveFolderId() { return getEnv("GOOGLE_DRIVE_FOLDER_ID"); },
  get isDriveMock() {
    const hasServiceAccount = isConfigured(getEnv("GOOGLE_CLIENT_EMAIL")) && isConfigured(getEnv("GOOGLE_PRIVATE_KEY"));
    const hasOAuth2 = isConfigured(getEnv("GOOGLE_CLIENT_ID")) && isConfigured(getEnv("GOOGLE_CLIENT_SECRET")) && isConfigured(getEnv("GOOGLE_REFRESH_TOKEN"));
    const hasFolder = isConfigured(getEnv("GOOGLE_DRIVE_FOLDER_ID"));
    return !(hasFolder && (hasServiceAccount || hasOAuth2));
  },

  get tiktokClientKey() { return getEnv("TIKTOK_CLIENT_KEY"); },
  get tiktokClientSecret() { return getEnv("TIKTOK_CLIENT_SECRET"); },
  get tiktokAccessToken() { return getEnv("TIKTOK_ACCESS_TOKEN"); },
  get tiktokRefreshToken() { return getEnv("TIKTOK_REFRESH_TOKEN"); },
  get isTiktokMock() { return !isConfigured(getEnv("TIKTOK_ACCESS_TOKEN")); },

  get bufferAccessToken() { return getEnv("BUFFER_ACCESS_TOKEN"); },
  get bufferProfileId() { return getEnv("BUFFER_PROFILE_ID"); },
  get isBufferMock() { return !isConfigured(getEnv("BUFFER_ACCESS_TOKEN")) || !isConfigured(getEnv("BUFFER_PROFILE_ID")); },
  
  get cronTime() { return getEnv("CRON_TIME", "0 8 * * *"); },
  get nodeEnv() { return getEnv("NODE_ENV", "development"); }
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
    const method = isConfigured(env.googleClientId) ? "OAuth 2.0 (Gmail 5TB Account)" : "Service Account JSON";
    logger.success(`Google Drive API configuration loaded successfully. Mode: ${method}`, "CONFIG");
  }

  if (env.isTiktokMock) {
    logger.warn("TIKTOK_ACCESS_TOKEN is missing! Using Mock TikTok publisher (posting steps will be logged only).", "CONFIG");
  } else {
    logger.success("TikTok Creator API credentials loaded successfully. Live publishing enabled!", "CONFIG");
  }

  if (env.isBufferMock) {
    logger.warn("BUFFER_ACCESS_TOKEN or BUFFER_PROFILE_ID is missing! Using Mock Buffer publisher.", "CONFIG");
  } else {
    logger.success("Buffer API credentials loaded successfully. Auto social publishing enabled!", "CONFIG");
  }
}
export default env;
