// ============================================================
// OSINT Platform — Provider Scoring System
// ============================================================
// Dynamic provider selection based on reliability, cost, latency,
// and success rate. No hardcoded provider order.
// ============================================================

import type {
  ProviderCapability,
  ProviderScore,
  ProviderSelectionContext,
  ProviderExecutionResult,
  ProviderAuditLog
} from "../types";
import type { OsintProvider } from "./provider.interface";
import { logger } from "../observability/logger";
import { providerReliabilityTracker } from "../confidence/provider-reliability";

interface ScoringWeights {
  reliability: number;    // 0-1, how much reliability matters
  cost: number;          // 0-1, how much cost matters (inverse)
  latency: number;       // 0-1, how much speed matters (inverse)  
  successRate: number;   // 0-1, how much recent success matters
  priority: number;      // 0-1, how much static priority matters
}

const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  reliability: 0.35,
  cost: 0.20,
  latency: 0.15,
  successRate: 0.20,
  priority: 0.10
};

export class ProviderScoringEngine {
  private weights: ScoringWeights;
  private auditLog: ProviderAuditLog[] = [];

  constructor(weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS) {
    this.weights = weights;
  }

  /**
   * Score all providers that offer the requested capability.
   * Returns providers ordered by score (highest first).
   */
  async scoreProviders(
    providers: OsintProvider[],
    context: ProviderSelectionContext
  ): Promise<ProviderScore[]> {
    const scored: ProviderScore[] = [];

    for (const provider of providers) {
      // Skip if not capable or excluded
      if (!provider.capabilities.includes(context.capability)) {
        continue;
      }

      if (context.excludeProviders?.includes(provider.id)) {
        continue;
      }

      const score = await this.calculateProviderScore(provider, context);
      
      // Apply filters
      if (context.minReliability && score.factors.reliability < context.minReliability) {
        continue;
      }

      scored.push(score);
    }

    // Sort by total score descending
    scored.sort((a, b) => b.totalScore - a.totalScore);

    // Boost preferred providers
    if (context.preferredProviders?.length) {
      scored.sort((a, b) => {
        const aPreferred = context.preferredProviders!.includes(a.providerId);
        const bPreferred = context.preferredProviders!.includes(b.providerId);
        
        if (aPreferred && !bPreferred) return -1;
        if (!aPreferred && bPreferred) return 1;
        return b.totalScore - a.totalScore;
      });
    }

    return scored;
  }

  /**
   * Calculate comprehensive score for a single provider
   */
  private async calculateProviderScore(
    provider: OsintProvider, 
    context: ProviderSelectionContext
  ): Promise<ProviderScore> {
    // Get reliability from tracker
    const reliabilityStats = providerReliabilityTracker.getStats(provider.id);
    const reliabilityScore = reliabilityStats ? 
      (reliabilityStats.successRate * 100) : 
      (provider.reliabilityScore || 70);

    // Get current metrics
    const metrics = provider.getMetrics ? await provider.getMetrics() : {
      avgLatencyMs: 2000,
      successRate: 0.9,
      errorCount24h: 0
    };

    // Calculate individual factor scores (0-100)
    const factors = {
      reliability: Math.min(100, reliabilityScore),
      cost: this.calculateCostScore(provider.costPerRequest || 0, context.budget),
      latency: this.calculateLatencyScore(metrics.avgLatencyMs, context.maxLatency),
      successRate: metrics.successRate * 100,
      priority: (provider.priority || 50)
    };

    // Weighted total score
    const totalScore = 
      (factors.reliability * this.weights.reliability) +
      (factors.cost * this.weights.cost) +
      (factors.latency * this.weights.latency) +
      (factors.successRate * this.weights.successRate) +
      (factors.priority * this.weights.priority);

    const reasoning = this.buildScoringReasoning(provider, factors, totalScore);

    return {
      providerId: provider.id,
      totalScore: Math.round(totalScore * 100) / 100,
      factors,
      reasoning
    };
  }

  private calculateCostScore(costPerRequest: number, budget?: number): number {
    if (costPerRequest === 0) return 100; // Free is best
    if (!budget) return Math.max(0, 100 - (costPerRequest * 10000)); // Penalize cost

    const costRatio = costPerRequest / budget;
    if (costRatio > 1) return 0; // Over budget
    return (1 - costRatio) * 100;
  }

  private calculateLatencyScore(avgLatencyMs: number, maxLatency?: number): number {
    if (maxLatency && avgLatencyMs > maxLatency) return 0; // Too slow
    
    // Score based on speed: <500ms = 100, >5000ms = 0
    const normalized = Math.max(0, Math.min(5000, avgLatencyMs));
    return Math.max(0, 100 - (normalized / 50));
  }

  private buildScoringReasoning(
    provider: OsintProvider, 
    factors: any, 
    totalScore: number
  ): string {
    const parts: string[] = [];
    
    if (factors.reliability > 80) parts.push("high reliability");
    else if (factors.reliability < 60) parts.push("reliability concerns");
    
    if (factors.cost === 100) parts.push("free");
    else if (factors.cost > 80) parts.push("low cost");
    else if (factors.cost < 40) parts.push("expensive");
    
    if (factors.latency > 80) parts.push("fast");
    else if (factors.latency < 40) parts.push("slow");
    
    if (factors.successRate > 90) parts.push("high success rate");
    else if (factors.successRate < 70) parts.push("recent failures");

    const summary = parts.length > 0 ? parts.join(", ") : "standard metrics";
    return `Score ${totalScore.toFixed(1)}: ${summary}`;
  }

  /**
   * Create fallback chain based on scores
   */
  createFallbackChain(scores: ProviderScore[], maxProviders: number = 3): string[] {
    return scores
      .slice(0, maxProviders)
      .map(score => score.providerId);
  }

  /**
   * Log provider selection decision for audit
   */
  logDecision(
    capability: ProviderCapability,
    selectedProviders: string[],
    fallbackChain: string[],
    executionResults: ProviderExecutionResult[],
    finalChoice: string
  ): void {
    const auditEntry: ProviderAuditLog = {
      timestamp: new Date().toISOString(),
      capability,
      selectedProviders,
      fallbackChain,
      executionResults,
      finalChoice,
      reasoning: this.buildDecisionReasoning(executionResults, finalChoice)
    };

    this.auditLog.push(auditEntry);
    
    // Keep last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog.shift();
    }

    logger.info("Provider selection decision", auditEntry);
  }

  private buildDecisionReasoning(
    results: ProviderExecutionResult[],
    finalChoice: string
  ): string {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    if (successful.length === 0) {
      return `All providers failed: ${failed.map(f => `${f.providerId}(${f.error})`).join(", ")}`;
    }

    const chosen = results.find(r => r.providerId === finalChoice);
    if (!chosen) {
      return `Selected ${finalChoice} (fallback choice)`;
    }

    return `Selected ${finalChoice}: ${chosen.results.length} results in ${chosen.durationMs}ms`;
  }

  /**
   * Get recent audit log for analysis
   */
  getAuditLog(limit: number = 100): ProviderAuditLog[] {
    return this.auditLog.slice(-limit);
  }

  /**
   * Update scoring weights
   */
  updateWeights(newWeights: Partial<ScoringWeights>): void {
    this.weights = { ...this.weights, ...newWeights };
    logger.info("Provider scoring weights updated", { weights: this.weights });
  }
}

/** Singleton scoring engine */
export const providerScoringEngine = new ProviderScoringEngine();