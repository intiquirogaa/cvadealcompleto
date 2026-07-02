// ============================================================
// OSINT Platform — Circuit Breaker
// ============================================================
// Protects providers from cascading failures.
//
// States:
//   CLOSED    → requests flow normally
//   OPEN      → requests fail fast (provider is down/blocked)
//   HALF_OPEN → one probe request allowed to test recovery
//
// Transition rules:
//   CLOSED → OPEN:    consecutiveFailures >= threshold
//   OPEN → HALF_OPEN: after cooldownMs elapsed
//   HALF_OPEN → CLOSED: probe succeeds
//   HALF_OPEN → OPEN: probe fails
// ============================================================

import { logger } from "../observability/logger";

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerConfig {
  /** Consecutive failures before opening the circuit */
  threshold: number;
  /** Time to wait before trying a probe (half-open) */
  cooldownMs: number;
}

interface CircuitBreakerState {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureAt: number;
  totalFailures: number;
  totalSuccesses: number;
  totalOpens: number;
}

export class CircuitBreaker {
  private s: CircuitBreakerState = {
    state: "closed",
    consecutiveFailures: 0,
    lastFailureAt: 0,
    totalFailures: 0,
    totalSuccesses: 0,
    totalOpens: 0,
  };

  constructor(
    private readonly providerId: string,
    private readonly config: CircuitBreakerConfig
  ) {}

  /**
   * Check if a request can proceed.
   * Returns true if CLOSED or HALF_OPEN (probe allowed).
   * Returns false if OPEN (fail fast).
   */
  canExecute(): boolean {
    if (this.s.state === "closed") return true;

    if (this.s.state === "open") {
      const elapsed = Date.now() - this.s.lastFailureAt;
      if (elapsed >= this.config.cooldownMs) {
        // Transition to half-open: allow one probe
        this.s.state = "half_open";
        logger.info("Circuit breaker half-open (probe allowed)", {
          providerId: this.providerId,
        });
        return true;
      }
      return false;
    }

    // half_open: only one probe at a time
    // If we're here, the probe is being attempted
    return true;
  }

  /** Report a successful request */
  recordSuccess(): void {
    this.s.totalSuccesses++;
    if (this.s.state === "half_open") {
      // Probe succeeded → close the circuit
      this.s.state = "closed";
      this.s.consecutiveFailures = 0;
      logger.info("Circuit breaker closed (recovered)", {
        providerId: this.providerId,
      });
    } else if (this.s.state === "closed") {
      this.s.consecutiveFailures = 0;
    }
  }

  /** Report a failed request */
  recordFailure(): void {
    this.s.totalFailures++;
    this.s.consecutiveFailures++;
    this.s.lastFailureAt = Date.now();

    if (this.s.state === "half_open") {
      // Probe failed → re-open the circuit
      this.openCircuit();
      return;
    }

    if (this.s.state === "closed" && this.s.consecutiveFailures >= this.config.threshold) {
      this.openCircuit();
    }
  }

  private openCircuit(): void {
    this.s.state = "open";
    this.s.totalOpens++;
    logger.warn("Circuit breaker opened", {
      providerId: this.providerId,
      consecutiveFailures: this.s.consecutiveFailures,
      threshold: this.config.threshold,
      cooldownMs: this.config.cooldownMs,
    });
  }

  /** Current state for observability */
  getState(): CircuitState {
    return this.s.state;
  }

  getStats() {
    return {
      providerId: this.providerId,
      state: this.s.state,
      consecutiveFailures: this.s.consecutiveFailures,
      totalFailures: this.s.totalFailures,
      totalSuccesses: this.s.totalSuccesses,
      totalOpens: this.s.totalOpens,
    };
  }
}

/**
 * Convenience: execute a function with circuit breaker protection.
 * Throws immediately if the circuit is open.
 */
export async function withCircuitBreaker<T>(
  breaker: CircuitBreaker,
  fn: () => Promise<T>
): Promise<T> {
  if (!breaker.canExecute()) {
    throw new Error(`CIRCUIT_OPEN:${breaker["providerId"]}`);
  }
  try {
    const result = await fn();
    breaker.recordSuccess();
    return result;
  } catch (err) {
    breaker.recordFailure();
    throw err;
  }
}
