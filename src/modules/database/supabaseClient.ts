import { createClient, SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import env from "../../config/env";
import { logger } from "../../utils/logger";

let supabase: SupabaseClient | null = null;

if (!env.isSupabaseMock) {
  try {
    supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      realtime: {
        transport: ws as any
      }
    });
    logger.info("Supabase client initialized successfully with WebSocket transport.", "DATABASE");
  } catch (err) {
    logger.error("Failed to initialize Supabase client. Switching to Mock mode.", err, "DATABASE");
    env.isSupabaseMock = true; // Force fallback
  }
}

export { supabase };
