import { supabase } from "../modules/database/supabaseClient";
import { logger } from "./logger";
import dotenv from "dotenv";

// Load configuration
dotenv.config();

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function testSupabaseConnection() {
  logger.info("==================================================", "DB-TEST");
  logger.info("STARTING DEDICATED SUPABASE CONNECTION TEST", "DB-TEST");
  logger.info("==================================================", "DB-TEST");

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env!", undefined, "DB-TEST");
    process.exit(1);
  }

  logger.info(`Connecting to Supabase URL: ${process.env.SUPABASE_URL}`, "DB-TEST");
  logger.info(`Using Key Prefix: ${process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 12)}...`, "DB-TEST");

  try {
    // 1. Test Select Query
    logger.info("1. Executing SELECT query on 'rss_sources' table...", "DB-TEST");
    const { data: selectData, error: selectError } = await supabase!
      .from("rss_sources")
      .select("*")
      .limit(5);

    if (selectError) {
      logger.error("SELECT Query Failed!", selectError, "DB-TEST");
      throw selectError;
    }

    logger.success(`SELECT Successful! Found ${selectData?.length || 0} existing sources in database.`, "DB-TEST");

    // 2. Test Write Query (Insert a dummy row to test RLS bypass)
    logger.info("2. Executing INSERT query to test write access (RLS bypass)...", "DB-TEST");
    const testId = generateUUID();
    const testRow = {
      id: testId,
      name: "Supabase Write Permission Test",
      url: "https://example.com/test-rss.rss",
      category: "Test",
      active: false
    };

    const { data: insertData, error: insertError } = await supabase!
      .from("rss_sources")
      .insert(testRow)
      .select();

    if (insertError) {
      logger.error("INSERT Query Failed! (RLS policy is blocking writes)", insertError, "DB-TEST");
      console.log("\n\x1b[31m\x1b[1mDetailed Error:\x1b[0m", insertError);
      throw insertError;
    }

    logger.success("INSERT Successful! Secret Key has successfully bypassed RLS write policies.", "DB-TEST");

    // 3. Clean up (Delete the dummy row)
    logger.info("3. Cleaning up database: Deleting test row...", "DB-TEST");
    const { error: deleteError } = await supabase!
      .from("rss_sources")
      .delete()
      .eq("id", testId);

    if (deleteError) {
      logger.warn(`Cleanup Warning: Could not delete temporary test row with ID: ${testId}`, "DB-TEST");
    } else {
      logger.success("Database cleaned up successfully.", "DB-TEST");
    }

    logger.info("==================================================", "DB-TEST");
    logger.success("SUPABASE CONNECTION AND WRITE TEST COMPLETED SUCCESSFULLY!", "DB-TEST");
    logger.info("==================================================", "DB-TEST");
    process.exit(0);

  } catch (err: any) {
    logger.info("==================================================", "DB-TEST");
    logger.error("SUPABASE CONNECTION TEST FAILED!", undefined, "DB-TEST");
    logger.info("==================================================", "DB-TEST");
    process.exit(1);
  }
}

testSupabaseConnection();
