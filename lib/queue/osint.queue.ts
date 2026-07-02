import { Queue } from "bullmq";
import { connection } from "./redis";

export const osintQueue = new Queue("osint-jobs", { connection });

/**
 * Enqueue a new OSINT investigation job
 */
export async function enqueueOsintRun(runId: string, clientId: string, trigger: string = "manual") {
  return osintQueue.add(
    "enrich-client",
    { runId, clientId, trigger },
    {
      jobId: runId, // Prevents duplicate concurrent runs for the same ID
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    }
  );
}

/**
 * Schedule a recurring job to re-enrich stale profiles every N days.
 * 
 * In a real production environment, you would have a separate worker 
 * picking this up, querying the DB for stale clients, and enqueueing 
 * individual `enqueueOsintRun` jobs for each one.
 */
export async function setupScheduledEnrichment(days: number = 30) {
  // CRON expression for every N days (approximate via BullMQ repeatable jobs)
  // or a simple cron like "0 0 */30 * *"
  return osintQueue.add(
    "scheduled-enrichment-batch",
    {},
    {
      repeat: {
        pattern: "0 0 * * *", // Run daily at midnight to check for stale profiles
      },
      jobId: "daily-enrichment-check",
    }
  );
}
