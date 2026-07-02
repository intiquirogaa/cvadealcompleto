// ============================================================
// OSINT Intelligence Platform — Confidence Engine
// ============================================================
// 5-dimension confidence scoring system.
//
// Dimensions (weights from OsintConfig.confidenceWeights):
//   1. sourceReliability  (0.25) — Bayesian, learned per-provider
//   2. corroboration      (0.30) — diminishing returns on sources
//   3. specificity        (0.20) — match precision (signal type)
//   4. recency            (0.10) — exponential decay by entity TTL
//   5. consistency        (0.15) — cross-source agreement
//
// Final score = weighted sum × 100 → 0-100 scale
// ============================================================

import type {
  ConfidenceFactors,
  ConfidenceWeights,
  EntityType,
  EvidenceRef,
  GraphEntity,
  GraphRelation,
  SignalType,
} from "../types";

import type { ProviderReliabilityTracker } from "./provider-reliability";
import { logger } from "../observability/logger";

// ─────────────────────────────────────────────────────────────
// Signal Type → Specificity Score
// ─────────────────────────────────────────────────────────────

const SIGNAL_SPECIFICITY: Record<SignalType, number> = {
  exact_email: 1.0,
  exact_phone: 1.0,
  full_name_company: 0.9,
  full_name_location: 0.8,
  surname_rare: 0.65,
  full_name_only: 0.5,
  surname_common: 0.25,
  first_name_only: 0.1,
};

// ─────────────────────────────────────────────────────────────
// Scoring Context
// ─────────────────────────────────────────────────────────────

export interface ScoringContext {
  reliabilityTracker: ProviderReliabilityTracker;
  weights: ConfidenceWeights;
  entityTtl: Partial<Record<EntityType, number>>;
  /** Override "now" for testing */
  now?: Date;
}

// ─────────────────────────────────────────────────────────────
// Scoring Result
// ─────────────────────────────────────────────────────────────

export interface ScoringResult {
  score: number;            // 0-100
  factors: ConfidenceFactors; // 0-1 each
  level: ConfidenceLevel;
}

export type ConfidenceLevel = "high" | "medium" | "low" | "minimal";

// ─────────────────────────────────────────────────────────────
// ConfidenceEngine
// ─────────────────────────────────────────────────────────────

export class ConfidenceEngine {
  private readonly ctx: ScoringContext;

  constructor(ctx: ScoringContext) {
    this.ctx = ctx;
  }

  // ── Main Entry Points ──

  /**
   * Score a GraphEntity based on its evidence, type, and recency.
   */
  scoreEntity(entity: GraphEntity): ScoringResult {
    const factors = this.computeFactors(
      entity.evidence,
      entity.type,
      entity.lastVerifiedAt,
    );

    const score = this.computeScore(factors);
    const level = this.classifyLevel(score);

    return { score, factors, level };
  }

  /**
   * Score a GraphRelation.
   */
  scoreRelation(rel: GraphRelation): ScoringResult {
    const factors = this.computeFactors(
      rel.evidence,
      "person", // Relations don't have their own type-based TTL; use person's
      rel.lastVerifiedAt,
    );

    const score = this.computeScore(factors);
    const level = this.classifyLevel(score);

    return { score, factors, level };
  }

  /**
   * Score a batch of entities and update their confidence fields
   * in-place.  Returns the average score.
   */
  scoreAndUpdateEntities(entities: GraphEntity[]): number {
    if (entities.length === 0) return 0;

    let totalScore = 0;
    for (const entity of entities) {
      const result = this.scoreEntity(entity);
      entity.confidence = result.score;
      entity.confidenceFactors = result.factors;
      totalScore += result.score;
    }

    const avg = totalScore / entities.length;
    logger.debug("Confidence scoring complete", {
      entityCount: entities.length,
      avgConfidence: Math.round(avg * 100) / 100,
    });

    return avg;
  }

  // ── Factor Computation ──

  /**
   * Compute all 5 confidence factors from evidence.
   */
  computeFactors(
    evidence: EvidenceRef[],
    entityType: EntityType,
    lastVerifiedAt: string,
  ): ConfidenceFactors {
    return {
      sourceReliability: this.computeSourceReliability(evidence),
      corroboration: this.computeCorroboration(evidence),
      specificity: this.computeSpecificity(evidence),
      recency: this.computeRecency(lastVerifiedAt, entityType),
      consistency: this.computeConsistency(evidence),
    };
  }

  // ── 1. Source Reliability ──

  /**
   * Average reliability of all providers that contributed evidence.
   * Uses the Bayesian ProviderReliabilityTracker.
   */
  private computeSourceReliability(evidence: EvidenceRef[]): number {
    if (evidence.length === 0) return 0.3; // No evidence → low reliability

    const providerScores: number[] = [];
    const seenProviders = new Set<string>();

    for (const ref of evidence) {
      if (!seenProviders.has(ref.provider)) {
        seenProviders.add(ref.provider);
        providerScores.push(
          this.ctx.reliabilityTracker.getReliability(ref.provider),
        );
      }
    }

    if (providerScores.length === 0) return 0.3;
    return providerScores.reduce((a, b) => a + b, 0) / providerScores.length;
  }

  // ── 2. Corroboration ──

  /**
   * Diminishing returns on the number of distinct source domains.
   * Formula: 1 - (1/2)^n  where n = distinct domains.
   *
   * 1 domain  → 0.50
   * 2 domains → 0.75
   * 3 domains → 0.875
   * 4 domains → 0.9375
   * ...
   */
  private computeCorroboration(evidence: EvidenceRef[]): number {
    if (evidence.length === 0) return 0;

    const domains = new Set<string>();
    for (const ref of evidence) {
      domains.add(ref.sourceDomain);
    }

    const n = domains.size;
    return 1 - Math.pow(0.5, n);
  }

  // ── 3. Specificity ──

  /**
   * The specificity of the best (highest) signal type among
   * all evidence refs.  Exact matches (email/phone) score 1.0;
   * vague name-only matches score much lower.
   */
  private computeSpecificity(evidence: EvidenceRef[]): number {
    if (evidence.length === 0) return 0;

    let max = 0;
    for (const ref of evidence) {
      const score = SIGNAL_SPECIFICITY[ref.matchType] ?? 0.3;
      if (score > max) max = score;
    }
    return max;
  }

  // ── 4. Recency ──

  /**
   * Exponential decay based on entity type TTL.
   *
   * recency = exp(-age_seconds / ttl_seconds)
   *
   * At age=0:     recency = 1.0
   * At age=TTL/2: recency ≈ 0.61
   * At age=TTL:   recency ≈ 0.37
   *
   * Entities without a TTL (e.g. news_item) always return 1.0.
   */
  private computeRecency(lastVerifiedAt: string, entityType: EntityType): number {
    const ttl = this.ctx.entityTtl[entityType];
    if (!ttl || ttl === Infinity) return 1.0; // No expiry

    const now = this.ctx.now ?? new Date();
    const verifiedAt = new Date(lastVerifiedAt);
    const ageSeconds = (now.getTime() - verifiedAt.getTime()) / 1000;

    if (ageSeconds <= 0) return 1.0;
    return Math.exp(-ageSeconds / ttl);
  }

  // ── 5. Consistency ──

  /**
   * Cross-source agreement proxy.
   *
   * - 2+ different providers contributed evidence → 1.0 (independent corroboration)
   * - 1 provider, multiple evidence refs → 0.7 (single source, no contradiction)
   * - 1 evidence ref total → 0.5 (single data point, unverified)
   * - 0 evidence refs → 0.3
   *
   * Note: true property-level conflict detection happens at the
   * agent level (before properties are merged).  This is a
   * source-diversity proxy.
   */
  private computeConsistency(evidence: EvidenceRef[]): number {
    if (evidence.length === 0) return 0.3;
    if (evidence.length === 1) return 0.5;

    const providers = new Set<string>();
    for (const ref of evidence) {
      providers.add(ref.provider);
    }

    if (providers.size >= 2) return 1.0; // Multi-provider = high consistency
    return 0.7; // Single provider, multiple refs
  }

  // ── Score Computation ──

  /**
   * Weighted sum of all 5 factors, scaled to 0-100.
   */
  computeScore(factors: ConfidenceFactors): number {
    const w = this.ctx.weights;

    // Normalize weights (in case they don't sum to 1.0)
    const totalWeight =
      w.sourceReliability +
      w.corroboration +
      w.specificity +
      w.recency +
      w.consistency;

    if (totalWeight === 0) return 0;

    const weighted =
      (factors.sourceReliability * w.sourceReliability +
        factors.corroboration * w.corroboration +
        factors.specificity * w.specificity +
        factors.recency * w.recency +
        factors.consistency * w.consistency) / totalWeight;

    return Math.round(weighted * 100);
  }

  // ── Classification ──

  /**
   * Classify a 0-100 score into a confidence level.
   * Thresholds come from OsintConfig.confidenceThresholds,
   * but we use sensible defaults here.
   */
  classifyLevel(score: number): ConfidenceLevel {
    if (score >= 80) return "high";
    if (score >= 60) return "medium";
    if (score >= 40) return "low";
    return "minimal";
  }

  // ── Provider Outcome Extraction ──

  /**
   * After scoring all entities, determine which providers were
   * "useful" (contributed evidence to entities with medium+ confidence)
   * and which were "useless" (evidence only on low/minimal entities).
   *
   * This feeds back into the ProviderReliabilityTracker.
   */
  extractProviderOutcomes(entities: GraphEntity[]): Record<string, { useful: number; useless: number }> {
    const outcomes: Record<string, { useful: number; useless: number }> = {};

    for (const entity of entities) {
      const level = this.classifyLevel(entity.confidence);
      const isUseful = level === "high" || level === "medium";

      const providers = new Set<string>();
      for (const ref of entity.evidence) {
        providers.add(ref.provider);
      }

      for (const provider of providers) {
        if (!outcomes[provider]) {
          outcomes[provider] = { useful: 0, useless: 0 };
        }
        if (isUseful) {
          outcomes[provider].useful++;
        } else {
          outcomes[provider].useless++;
        }
      }
    }

    return outcomes;
  }

  /**
   * Score entities and feed outcomes back to the reliability tracker.
   * This is the "learning loop" — call after each investigation run.
   */
  scoreAndLearn(entities: GraphEntity[]): {
    avgScore: number;
    providerOutcomes: Record<string, { useful: number; useless: number }>;
  } {
    const avgScore = this.scoreAndUpdateEntities(entities);
    const providerOutcomes = this.extractProviderOutcomes(entities);
    this.ctx.reliabilityTracker.applyRunOutcomes(providerOutcomes);

    logger.info("Confidence learning loop complete", {
      entityCount: entities.length,
      avgScore: Math.round(avgScore * 100) / 100,
      providersUpdated: Object.keys(providerOutcomes).length,
    });

    return { avgScore, providerOutcomes };
  }
}
