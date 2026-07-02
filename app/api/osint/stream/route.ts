import { NextRequest } from "next/server";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");

  if (!runId) {
    return new Response("Missing runId", { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Connect to Redis specifically for this SSE subscription
      const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
      const subscriber = new Redis(REDIS_URL);
      
      const channel = `osint-events:${runId}`;
      await subscriber.subscribe(channel);

      controller.enqueue(
        `data: ${JSON.stringify({ type: "connected", message: "Listening for updates..." })}\n\n`
      );

      subscriber.on("message", (ch, message) => {
        if (ch === channel) {
          controller.enqueue(`data: ${message}\n\n`);
          
          const parsed = JSON.parse(message);
          // If terminal state, we can optionally close
          if (parsed.type === "completed" || parsed.type === "error") {
            setTimeout(() => {
              subscriber.quit();
              try { controller.close(); } catch (e) {}
            }, 1000);
          }
        }
      });

      // Heartbeat to keep connection alive
      const interval = setInterval(() => {
        try {
          controller.enqueue(`:\n\n`); // comment line for keep-alive
        } catch (e) {
          clearInterval(interval);
        }
      }, 30000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        subscriber.quit();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
