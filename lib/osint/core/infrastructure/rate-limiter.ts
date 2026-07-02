// ============================================================
// OSINT Platform — Token Bucket Rate Limiter
// ============================================================
// Configurable per-provider rate limiting using the token
// bucket algorithm. Ensures we never exceed a provider's
// request rate, avoiding blocks and CAPTCHAs.
//
// Key features:
//   - Configurable requestsPerSecond per provider
//   - Configurable max burst (maxConcurrent)
//   - No busy-waiting (uses async sleep, not polling)
//   - Thread-safe within a single Node.js process
// ============================================================

import { logger } from "../observability/logger";

export interface RateLimiterConfig {
  /** Maximum concurrent in-flight requests */
  maxConcurrent: number;
  /** Steady-state requests per second */
  requestsPerSecond: number;
}

interface BucketState {
  tokens: number;
  lastRefill: number;
  activeRequests: number;
}

export class TokenBucketRateLimiter {
  private state: BucketState;
  private waiters: Array<() => void> = [];

  constructor(
    private readonly providerId: string,
    private readonly config: RateLimiterConfig
  ) {
    this.state = {
      tokens: config.maxConcurrent,
      lastRefill: Date.now(),
      activeRequests: 0,
    };
  }

  /**
   * Acquire a slot. Resolves when a token is available.
   * Uses async/await — no busy-waiting.
   */
  async acquire(): Promise<void> {
    this.refill();

    // If we have tokens and capacity, acquire immediately
    if (this.state.tokens >= 1 && this.state.activeRequests < this.config.maxConcurrent) {
      this.state.tokens -= 1;
      this.state.activeRequests += 1;
      return;
    }

    // Otherwise, wait for a token to become available
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });

    this.refill();
    this.state.tokens -= 1;
    this.state.activeRequests += 1;
  }

  /** Release a slot after a request completes */
  release(): void {
    this.state.activeRequests = Math.max(0, this.state.activeRequests - 1);
    this.refill();

    // Wake up the next waiter if we have tokens
    if (this.state.tokens >= 1 && this.waiters.length > 0) {
      const next = this.waiters.shift();
      if (next) next();
    }
  }

  /** Refill tokens based on elapsed time */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.state.lastRefill) / 1000;
    const refillAmount = elapsed * this.config.requestsPerSecond;
    this.state.tokens = Math.min(
      this.config.maxConcurrent,
      this.state.tokens + refillAmount
    );
    this.state.lastRefill = now;
  }

  /** Current snapshot for observability */
  getStats() {
    return {
      providerId: this.providerId,
      tokens: Math.floor(this.state.tokens),
      activeRequests: this.state.activeRequests,
      maxConcurrent: this.config.maxConcurrent,
      rps: this.config.requestsPerSecond,
    };
  }
}

/**
 * Convenience function: acquire, run, release.
 * Ensures release always happens even on error.
 */
export async function withRateLimit<T>(
  limiter: TokenBucketRateLimiter,
  fn: () => Promise<T>
): Promise<T> {
  await limiter.acquire();
  try {
    return await fn();
  } finally {
    limiter.release();
  }
}
