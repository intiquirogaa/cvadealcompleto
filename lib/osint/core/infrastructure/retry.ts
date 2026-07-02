// ============================================================
// OSINT Platform — Retry with Exponential Backoff + Jitter
// ============================================================
// Replaces the linear backoff (attempt * 2000ms) used in the
// old BingProvider/GoogleProvider.
//
// delay = min(maxDelay, baseMs * 2^attempt) + random(0, jitterMs)
//
// The jitter prevents thundering herd: when multiple requests
// get rate-limited simultaneously, they don't all retry at the
// same moment.
// ============================================================

import { logger } from "../observability/logger";

export interface RetryConfig {
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  jitterMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  backoffBaseMs: 1000,
  backoffMaxMs: 30000,
  jitterMs: 1000,
};

/**
 * Determine if an error is retryable.
 * Retries on: timeouts, 429 (rate limit), 503 (service unavailable),
 * 502 (bad gateway), network errors.
 */
export function isRetryableError(err: unknown): boolean {
  if (!err) return false;

  const error = err as { name?: string; status?: number; message?: string };

  // Timeout errors
  if (error.name === "TimeoutError") return true;
  if (error.name === "AbortError") return true;

  // Network errors
  if (error.name === "TypeError" && error.message?.includes("fetch")) return true;

  // HTTP status codes that warrant retry
  if (error.status) {
    return [429, 502, 503, 504].includes(error.status);
  }

  // Check for status in message (some providers throw Error with status)
  if (error.message) {
    if (error.message.includes("429")) return true;
    if (error.message.includes("503")) return true;
    if (error.message.includes("502")) return true;
    if (error.message.includes("fetch failed")) return true;
    if (error.message.includes("ECONNRESET")) return true;
    if (error.message.includes("ETIMEDOUT")) return true;
  }

  return false;
}

/**
 * Compute the delay for a given attempt number.
 * delay = min(maxDelay, base * 2^attempt) + random(0, jitter)
 */
export function computeBackoffDelay(
  attempt: number,
  config: RetryConfig
): number {
  const exponential = config.backoffBaseMs * Math.pow(2, attempt);
  const capped = Math.min(config.backoffMaxMs, exponential);
  const jitter = Math.random() * config.jitterMs;
  return Math.round(capped + jitter);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Execute a function with exponential backoff retries.
 * Only retries on retryable errors (timeouts, 429, 503, etc.).
 * Non-retryable errors (4xx, parse errors) fail immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  contextLabel: string = "unknown"
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (!isRetryableError(err) || attempt === config.maxRetries) {
        throw err;
      }

      const delay = computeBackoffDelay(attempt, config);
      logger.warn("Retrying after error", {
        context: contextLabel,
        attempt: attempt + 1,
        maxRetries: config.maxRetries,
        delayMs: delay,
        error: err instanceof Error ? err.message : String(err),
      });

      await sleep(delay);
    }
  }

  throw lastError;
}
