// ============================================================
// OSINT Intelligence Platform — Provider Reliability Tracker
// ============================================================
// Bayesian learning system that tracks how reliable each data
// provider is based on observed outcomes.
//
// Uses a Beta(α, β) distribution per provider:
//   α = prior_alpha + useful_count
//   β = prior_beta + useless_count
//   reliability = α / (α + β)
//
// Starting prior: Beta(2, 2) → mean = 0.5 (neutral)
//
// "Useful" = the provider's result was corroborated by at least
// one other independent source within the same run.
// "Useless" = the result was not corroborated or was a false positive.
// ============================================================

import { logger } from "../observability/logger";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ProviderReliabilityStats {
  providerId: string;
  alpha: number;
  beta: number;
  reliability: number;
  totalObservations: number;
  usefulCount: number;
  uselessCount: number;
  lastUpdated: string;
}

// ─────────────────────────────────────────────────────────────
// ProviderReliabilityTracker
// ─────────────────────────────────────────────────────────────

const PRIOR_ALPHA = 2;   // Beta prior — slightly optimistic
const PRIOR_BETA = 2;    // Beta prior — slightly optimistic
const DECAY_FACTOR = 0.95; // Per-update decay to allow adaptation over time
const MIN_OBSERVATIONS = 3; // Below this, clamp toward 0.5

export class ProviderReliabilityTracker {
  private readonly stats = new Map<string, ProviderReliabilityStats>();

  /**
   * Get the current reliability score for a provider.
   * Returns 0.5 for unknown providers (neutral prior).
   */
  getReliability(providerId: string): number {
    const s = this.stats.get(providerId);
    if (!s) return 0.5;
    return s.reliability;
  }

  /**
   * Record that a provider's result was useful (corroborated).
   */
  recordUseful(providerId: string): void {
    this.update(providerId, true);
  }

  /**
   * Record that a provider's result was not useful (not corroborated
   * or was a false positive).
   */
  recordUseless(providerId: string): void {
    this.update(providerId, false);
  }

  /**
   * Batch-update reliability based on a run's outcomes.
   * `outcomes` maps providerId → { useful: number, useless: number }.
   */
  applyRunOutcomes(outcomes: Record<string, { useful: number; useless: number }>): void {
    for (const [providerId, counts] of Object.entries(outcomes)) {
      for (let i = 0; i < counts.useful; i++) this.update(providerId, true);
      for (let i = 0; i < counts.useless; i++) this.update(providerId, false);
    }
    logger.debug("Provider reliability updated", {
      providerCount: Object.keys(outcomes).length,
    });
  }

  /**
   * Get stats for all tracked providers.
   */
  getAllStats(): ProviderReliabilityStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * Get stats for a single provider.
   */
  getStats(providerId: string): ProviderReliabilityStats | null {
    return this.stats.get(providerId) ?? null;
  }

  /**
   * Serialize to a plain object (for persistence).
   */
  toJSON(): Record<string, ProviderReliabilityStats> {
    const result: Record<string, ProviderReliabilityStats> = {};
    for (const [id, s] of this.stats) {
      result[id] = s;
    }
    return result;
  }

  /**
   * Deserialize from a plain object.
   */
  static fromJSON(data: Record<string, ProviderReliabilityStats>): ProviderReliabilityTracker {
    const tracker = new ProviderReliabilityTracker();
    for (const [id, s] of Object.entries(data)) {
      tracker.stats.set(id, { ...s });
    }
    return tracker;
  }

  // ── Internal ──

  private update(providerId: string, wasUseful: boolean): void {
    let s = this.stats.get(providerId);

    if (!s) {
      s = {
        providerId,
        alpha: PRIOR_ALPHA,
        beta: PRIOR_BETA,
        reliability: 0.5,
        totalObservations: 0,
        usefulCount: 0,
        uselessCount: 0,
        lastUpdated: new Date().toISOString(),
      };
      this.stats.set(providerId, s);
    }

    // Apply decay to historical observations (allows adaptation)
    s.alpha *= DECAY_FACTOR;
    s.beta *= DECAY_FACTOR;
    // Re-add the prior (so it doesn't fully decay away)
    s.alpha += PRIOR_ALPHA * (1 - DECAY_FACTOR);
    s.beta += PRIOR_BETA * (1 - DECAY_FACTOR);

    if (wasUseful) {
      s.alpha += 1;
      s.usefulCount++;
    } else {
      s.beta += 1;
      s.uselessCount++;
    }

    s.totalObservations++;
    s.lastUpdated = new Date().toISOString();

    // Compute posterior mean
    const mean = s.alpha / (s.alpha + s.beta);

    // Shrink toward 0.5 when we have few observations
    if (s.totalObservations < MIN_OBSERVATIONS) {
      const shrinkage = s.totalObservations / MIN_OBSERVATIONS;
      s.reliability = 0.5 * (1 - shrinkage) + mean * shrinkage;
    } else {
      s.reliability = mean;
    }
  }
}

/**
 * Singleton instance — shared across all runs in the same process.
 */
export const providerReliabilityTracker = new ProviderReliabilityTracker();
