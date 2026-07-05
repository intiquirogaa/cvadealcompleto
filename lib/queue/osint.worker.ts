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
          notes: client.notes || undefined,
        }, runId);

        // Persist the enrichment result onto the CRM client itself — the
        // CRM UI reads client.insights/lastEnriched (not the OSINT graph
        // tables) to render the profile after "Enriquecer perfil".
        const socialLinks: Record<string, string> = {};
        for (const profile of result.socialProfiles ?? []) {
          if (profile.url?.value) {
            socialLinks[profile.platform] = profile.url.value;
          }
        }
        // The person's own social profiles never include a "website" platform
        // (SocialProfile.platform is linkedin/instagram/facebook/twitter/...),
        // so without this the CRM's "Web" field stayed empty forever even when
        // OSINT found the associated company's site — it was only ever stored
        // under result.company.website, never copied into socialLinks.
        if (result.company?.website?.value) {
          socialLinks.website = result.company.website.value;
        }

        // The card (and header) read client.profession/client.company
        // directly — without this, OSINT can detect a profession/company
        // with real confidence and the UI still shows "no registrada"
        // forever, because those columns are otherwise only ever set by
        // hand in the edit form. Only fill them in if empty and the
        // detection clears a reasonable confidence bar, so we never
        // clobber an advisor's manually-verified value with a guess.
        const MIN_CONFIDENCE_TO_AUTOFILL = 50;
        const detectedProfession =
          !client.profession && (result.profession?.confidence ?? 0) >= MIN_CONFIDENCE_TO_AUTOFILL
            ? result.profession?.value
            : undefined;
        const detectedCompanyName = result.company?.name;
        const detectedCompany =
          !client.company && (detectedCompanyName?.confidence ?? 0) >= MIN_CONFIDENCE_TO_AUTOFILL
            ? detectedCompanyName?.value
            : undefined;

        await prisma.cRMClient.update({
          where: { id: clientId },
          data: {
            insights: JSON.stringify(result),
            lastEnriched: new Date(),
            ...(Object.keys(socialLinks).length > 0
              ? { socialLinks: JSON.stringify(socialLinks) }
              : {}),
            ...(detectedProfession ? { profession: detectedProfession } : {}),
            ...(detectedCompany ? { company: detectedCompany } : {}),
          },
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
      const now = new Date();

      // --- Auto re-enrichment: opted-in clients whose own interval has
      // elapsed since their last enrichment (or that were never enriched).
      const candidates = await prisma.cRMClient.findMany({
        where: { autoEnrichEnabled: true },
        take: 200,
      });

      const staleClients = candidates.filter((client) => {
        const intervalDays = client.autoEnrichIntervalDays ?? 30;
        if (!client.lastEnriched) return true;
        const dueAt = new Date(client.lastEnriched);
        dueAt.setDate(dueAt.getDate() + intervalDays);
        return dueAt <= now;
      });

      let scheduled = 0;
      for (const client of staleClients) {
        const { enqueueOsintRun } = await import("./osint.queue");
        const run = await prisma.osintRun.create({
          data: {
            clientId: client.id,
            trigger: "scheduled",
            status: "pending",
          },
        });
        await enqueueOsintRun(run.id, client.id, "scheduled");
        await prisma.cRMActivityLog.create({
          data: {
            clientId: client.id,
            type: "auto_enrich_queued",
            title: "Re-enriquecimiento automático programado",
            description: `Corresponde al intervalo configurado de ${client.autoEnrichIntervalDays ?? 30} días.`,
          },
        });
        scheduled++;
      }

      // --- Call reminders: clients whose nextContactDate lands today.
      // Idempotent per day: skip clients that already got a reminder
      // logged today (the job can run more than once a day if the worker
      // restarts, and BullMQ's own repeat schedule shouldn't double-log).
      //
      // nextContactDate is stored as a UTC-midnight timestamp (date-only
      // strings like "2026-07-04" parse to 2026-07-04T00:00:00.000Z
      // regardless of server timezone — see the PUT route). Using
      // setHours() here would compute the day window in the server's
      // local timezone (America/Argentina/Buenos_Aires, UTC-3), shifting
      // the window 3h off from how the value was stored and missing
      // today's reminders entirely. Stay in UTC to match.
      const startOfDay = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0
      ));
      const endOfDay = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999
      ));

      const dueToday = await prisma.cRMClient.findMany({
        where: { nextContactDate: { gte: startOfDay, lte: endOfDay } },
        take: 200,
      });

      let reminded = 0;
      for (const client of dueToday) {
        const alreadyLogged = await prisma.cRMActivityLog.findFirst({
          where: {
            clientId: client.id,
            type: "reminder_call",
            createdAt: { gte: startOfDay },
          },
        });
        if (alreadyLogged) continue;

        await prisma.cRMActivityLog.create({
          data: {
            clientId: client.id,
            type: "reminder_call",
            title: `Recordatorio: llamar a ${client.firstName} ${client.lastName}`,
            description: client.nextContactNote || "Seguimiento programado",
          },
        });
        reminded++;
      }

      logger.info("Scheduled enrichment batch completed", { scheduled, reminded });
      return { scheduled, reminded };
    }
  },
  {
    connection,
    // Each investigation can spin up a real headless Chromium (browser-pool.ts,
    // for Bing/DuckDuckGo scraping) plus Apify actor calls. On a small VM
    // (4 cores / 6GB RAM here) running 5 of those concurrently is enough to
    // exhaust memory and hang the whole machine, not just the Node process —
    // confirmed after a real freeze that required a hard reboot. 1 keeps
    // memory bounded; raise it only on a box with real headroom to spare.
    concurrency: 1,
  }
);

osintWorker.on("completed", (job) => {
  console.log(`[BullMQ] Job ${job.id} completed successfully`);
});

osintWorker.on("failed", (job, err) => {
  console.error(`[BullMQ] Job ${job?.id} failed with ${err.message}`);
});

import("./osint.queue").then(({ setupScheduledEnrichment }) =>
  setupScheduledEnrichment()
);
