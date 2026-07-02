// ============================================================
// OSINT Enrichment Pipeline — Confidence Score Utilities
// ============================================================

import type { EnrichedDatum } from '../types';

/** Create an EnrichedDatum with the given value, confidence, and source */
export function datum<T>(
  value: T,
  confidence: number,
  source: string,
  sourceUrl?: string,
): EnrichedDatum<T> {
  return {
    value,
    confidence: Math.round(Math.min(100, Math.max(0, confidence))),
    source,
    sourceUrl,
    lastVerified: new Date().toISOString(),
  };
}

/**
 * Determine confidence for a social profile URL based on match reasons.
 * - 2+ strong signals → 90
 * - 1 strong signal → 70
 * - weak signals only → 45
 */
export function socialConfidence(matchReasons: string[]): number {
  const strongSignals = matchReasons.filter((r) =>
    r.toLowerCase().includes('empresa') ||
    r.toLowerCase().includes('email') ||
    r.toLowerCase().includes('ciudad') ||
    r.toLowerCase().includes('cargo') ||
    r.toLowerCase().includes('foto'),
  );
  if (strongSignals.length >= 2) return 90;
  if (strongSignals.length === 1) return 70;
  if (matchReasons.length >= 2) return 55;
  if (matchReasons.length === 1) return 40;
  return 25;
}

/**
 * Weighted average of multiple confidence scores.
 * Weights should sum to 1.0.
 */
export function weightedConfidence(scores: { value: number; weight: number }[]): number {
  const total = scores.reduce((sum, s) => sum + s.weight, 0);
  if (total === 0) return 0;
  const weighted = scores.reduce((sum, s) => sum + s.value * s.weight, 0);
  return Math.round(weighted / total);
}
