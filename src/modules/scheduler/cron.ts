import cron from "node-cron";
import env from "../../config/env";
import { logger } from "../../utils/logger";
import { runWorkflow } from "../../main";

logger.info("==================================================", "SCHEDULER");
logger.info("INITIALIZING AUTOMATED CRON SCHEDULER", "SCHEDULER");
logger.info(`Target Schedule: ${env.cronTime}`, "SCHEDULER");
logger.info("Timezone: Asia/Ho_Chi_Minh (Indochina Time - UTC+7)", "SCHEDULER");
logger.info("==================================================", "SCHEDULER");

// Register scheduled task
const task = cron.schedule(
  env.cronTime,
  async () => {
    logger.info("CRON TRIGGER: Launching morning news pipeline...", "SCHEDULER");
    try {
      await runWorkflow();
      logger.success("CRON EXECUTION: Successfully processed today's batch.", "SCHEDULER");
    } catch (err: any) {
      logger.error("CRON EXECUTION: Scheduled workflow failed with errors.", err, "SCHEDULER");
    }
  },
  {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh" // Explicitly target Vietnam timezone
  }
);

// Graceful termination handling
process.on("SIGINT", () => {
  logger.info("Shutting down automated cron daemon...", "SCHEDULER");
  task.stop();
  process.exit(0);
});

logger.success("Cron scheduler daemon is running. Waiting for trigger...", "SCHEDULER");
