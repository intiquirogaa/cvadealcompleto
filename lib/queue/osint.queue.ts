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
 * Register the daily job that checks, per client, whether it's due for
 * auto re-enrichment (autoEnrichEnabled + autoEnrichIntervalDays) or has a
 * call reminder (nextContactDate) landing today. BullMQ dedupes repeatable
 * jobs by jobId, so calling this on every worker boot is safe/idempotent.
 */
export async function setupScheduledEnrichment() {
  return osintQueue.add(
    "scheduled-enrichment-batch",
    {},
    {
      repeat: {
        pattern: "0 9 * * *", // Daily at 09:00
      },
      jobId: "daily-enrichment-check",
    }
  );
}
