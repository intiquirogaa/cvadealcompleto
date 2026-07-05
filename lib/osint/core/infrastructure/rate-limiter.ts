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
   *
   * Loops rather than waiting on a single externally-woken promise:
   * a bare "push a resolver and wait for release() to call it" design
   * deadlocks whenever the caller is the only one in flight (tokens
   * depleted, nothing else will ever call release() to wake it up).
   * Each iteration waits at most until the next token is due to
   * refill, so a lone caller always makes forward progress.
   */
  async acquire(): Promise<void> {
    for (;;) {
      this.refill();

      if (this.state.tokens >= 1 && this.state.activeRequests < this.config.maxConcurrent) {
        this.state.tokens -= 1;
        this.state.activeRequests += 1;
        return;
      }

      const waitMs = this.state.tokens < 1
        ? Math.max(25, Math.ceil(((1 - this.state.tokens) / this.config.requestsPerSecond) * 1000))
        : 25;
      await this.waitForReleaseOrTimeout(waitMs);
    }
  }

  /** Resolves on the next release() call or after timeoutMs, whichever is first. */
  private waitForReleaseOrTimeout(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const idx = this.waiters.indexOf(finish);
        if (idx !== -1) this.waiters.splice(idx, 1);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      this.waiters.push(finish);
    });
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
