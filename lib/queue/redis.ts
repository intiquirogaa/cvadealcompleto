import Redis from "ioredis";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Reusable Redis connection for BullMQ
export const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

connection.on("error", (err) => {
  console.error("Redis connection error:", err);
});
