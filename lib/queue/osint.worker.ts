import { Worker, Job } from "bullmq";
import { connection } from "./redis";
import { OsintService } from "../osint/osint.service";
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
        const client = await prisma.cRMClient.findUnique({ where: { id: clientId } });
        if (!client) throw new Error("Client not found");

        const osintService = new OsintService();
        
        // Let's publish progress as we go
        await pubClient.publish(`osint-events:${runId}`, JSON.stringify({
          type: "status",
          status: "running",
          message: "Buscando información en la web...",
          timestamp: Date.now()
        }));

        const result = await osintService.enrich({
          id: client.id,
          firstName: client.firstName,
          lastName: client.lastName,
          email: client.email,
          phone: client.phone,
          locality: client.locality,
          profession: client.profession || undefined,
          company: client.company || undefined,
        });

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
      
      const staleClients = await prisma.cRMClient.findMany({
        where: {
          lastEnriched: {
            lt: thirtyDaysAgo
          }
        },
        take: 50
      });

      let queued = 0;
      for (const client of staleClients) {
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
    concurrency: 5,
  }
);

osintWorker.on("completed", (job) => {
  console.log(`[BullMQ] Job ${job.id} completed successfully`);
});

osintWorker.on("failed", (job, err) => {
  console.error(`[BullMQ] Job ${job?.id} failed with ${err.message}`);
});
