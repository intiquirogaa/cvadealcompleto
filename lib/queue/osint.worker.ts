import { Worker, Job } from "bullmq";
import { connection } from "./redis";
import { OsintPlannerAgent } from "../osint/agents/osint-planner";
import { prisma } from "../db";
import { logger } from "../osint/core/observability/logger";

// Create a publisher for SSE events
const pubClient = connection.duplicate();

export const osintWorker = new Worker(
  "osint-jobs",
  async (job: Job) => {
    if (job.name === "enrich-client") {
      const { runId, clientId, trigger } = job.data;
      
      logger.info(`Starting background job for run: ${runId}`, { runId, clientId });
      
      // Update DB to running
      await prisma.osintRun.update({
        where: { id: runId },
        data: { status: "running" }
      });
      
      // Publish event to Redis
      await pubClient.publish(`osint-events:${runId}`, JSON.stringify({
        type: "status",
        status: "running",
        message: "Iniciando investigación en segundo plano...",
        timestamp: Date.now()
      }));

      try {
        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (!client) throw new Error("Client not found");

        const targetEntity = {
          id: client.id,
          type: "Person" as const,
          properties: {
            name: client.name || undefined,
            email: client.email || undefined,
            phone: client.phone || undefined,
          },
          confidence: 1.0,
        };

        const planner = new OsintPlannerAgent(runId, targetEntity);
        
        // Let's hook into the planner's logger to emit real-time events, 
        // but for simplicity, we just run it and publish success
        const result = await planner.execute();

        // Publish success
        await pubClient.publish(`osint-events:${runId}`, JSON.stringify({
          type: "completed",
          status: "completed",
          message: "Investigación completada exitosamente.",
          data: result,
          timestamp: Date.now()
        }));

        logger.info(`Completed background job for run: ${runId}`, { runId });
        return result;
      } catch (error: any) {
        // Publish failure
        await pubClient.publish(`osint-events:${runId}`, JSON.stringify({
          type: "error",
          status: "failed",
          message: error.message,
          timestamp: Date.now()
        }));
        
        logger.error(`Failed background job for run: ${runId}`, { runId, error: error.message });
        throw error;
      }
    }

    if (job.name === "scheduled-enrichment-batch") {
      // Find clients not updated in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const staleClients = await prisma.client.findMany({
        where: {
          updatedAt: {
            lt: thirtyDaysAgo
          }
        },
        take: 50
      });

      let queued = 0;
      for (const client of staleClients) {
        // We import dynamically to avoid circular dependency if queue imports worker
        const { enqueueOsintRun } = await import("./osint.queue");
        const run = await prisma.osintRun.create({
          data: {
            clientId: client.id,
            trigger: "scheduled",
            status: "pending"
          }
        });
        await enqueueOsintRun(run.id, client.id, "scheduled");
        queued++;
      }
      return { scheduled: queued };
    }
  },
  {
    connection,
    concurrency: 5, // Run up to 5 investigations concurrently
  }
);

osintWorker.on("completed", (job) => {
  console.log(`[BullMQ] Job ${job.id} completed successfully`);
});

osintWorker.on("failed", (job, err) => {
  console.error(`[BullMQ] Job ${job?.id} failed with ${err.message}`);
});

// To run this standalone:
// if (require.main === module) { console.log("Worker started"); }
