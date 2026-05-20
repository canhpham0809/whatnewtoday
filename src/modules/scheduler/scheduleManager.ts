import cron, { ScheduledTask } from "node-cron";
import { ScheduleRepository, ScheduleEntry } from "../database/repositories";
import { logger } from "../../utils/logger";
import { runWorkflow } from "../../main";

// Map from schedule id → active ScheduledTask
const activeTasks = new Map<string, ScheduledTask>();

let isWorkflowRunning = false;

// Convert "HH:MM" Vietnam time → cron expression "MM HH * * *"
function timeToCron(time: string): string {
  const [hh, mm] = time.split(":");
  return `${mm} ${hh} * * *`;
}

function startTask(entry: ScheduleEntry) {
  // Stop existing task for this id if any
  stopTask(entry.id);

  if (!entry.enabled) return;

  const cronExpr = timeToCron(entry.time);
  logger.info(`Scheduling "${entry.label}" at ${entry.time} (cron: ${cronExpr})`, "SCHEDULE-MGR");

  const task = cron.schedule(
    cronExpr,
    async () => {
      if (isWorkflowRunning) {
        logger.warn(`Schedule "${entry.label}" triggered but pipeline already running. Skipped.`, "SCHEDULE-MGR");
        return;
      }
      isWorkflowRunning = true;
      logger.info(`SCHEDULE TRIGGER: "${entry.label}" — launching pipeline...`, "SCHEDULE-MGR");
      try {
        await runWorkflow();
        logger.success(`SCHEDULE DONE: "${entry.label}" completed successfully.`, "SCHEDULE-MGR");
      } catch (err) {
        logger.error(`SCHEDULE ERROR: "${entry.label}" failed.`, err, "SCHEDULE-MGR");
      } finally {
        isWorkflowRunning = false;
      }
    },
    { scheduled: true, timezone: "Asia/Ho_Chi_Minh" }
  );

  activeTasks.set(entry.id, task);
}

function stopTask(id: string) {
  const task = activeTasks.get(id);
  if (task) {
    task.stop();
    activeTasks.delete(id);
    logger.info(`Stopped cron task: ${id}`, "SCHEDULE-MGR");
  }
}

/** Called once on server startup — loads all enabled schedules from DB */
export async function initScheduleManager() {
  logger.info("Initializing dynamic schedule manager...", "SCHEDULE-MGR");
  const entries = await ScheduleRepository.getAll();
  for (const entry of entries) {
    startTask(entry);
  }
  logger.success(`Loaded ${entries.length} schedule entries (${entries.filter(e => e.enabled).length} active).`, "SCHEDULE-MGR");
}

/** Called from API when a schedule is created/updated/toggled */
export function reloadSchedule(entry: ScheduleEntry) {
  startTask(entry);
}

/** Called from API when a schedule is deleted */
export function removeSchedule(id: string) {
  stopTask(id);
}

/** Returns list of currently active (running) task ids */
export function getActiveTaskIds(): string[] {
  return [...activeTasks.keys()];
}

export function setExternalWorkflowRunning(val: boolean) {
  isWorkflowRunning = val;
}
