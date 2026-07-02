import type { SearchResult, ClientInput, IdentityResult } from "../types";
import { normalizeText } from "./evidence-ranking";
import {
  generateNameVariants,
  getPhoneDigitPatterns,
  computeAuthenticity,
  type AuthenticityMatch,
} from "./variant-generator";

/**
 * Identity resolution using the variant-based authenticity algorithm.
 * 
 * For each piece of evidence, we compute an AuthenticityMatch that checks
 * ALL name variants (e.g. "Inti Quiroga", "Inti Pichipillan", etc.)
 * and ALL phone variants (e.g. "2804823370", "2804-823370", etc.)
 * 
 * Evidence items are ranked by their authenticity score.
 * The overall identity confidence is derived from the best matches found.
 */
export function resolveIdentity(
  client: ClientInput,
  evidence: SearchResult[]
): IdentityResult {
  const VERIFIED_THRESHOLD = 70;

  // Pre-compute all variants
  const nameVariants = generateNameVariants(client.firstName, client.lastName);
  const phonePatterns = getPhoneDigitPatterns(client.phone);

  console.log(`[Identity] Generated ${nameVariants.length} name variants, ${phonePatterns.length} phone patterns`);
  console.log(`[Identity] Top name variants: ${nameVariants.slice(0, 5).map(v => `"${v.value}" (${Math.round(v.strength * 100)}%)`).join(', ')}`);

  // Score every piece of evidence
  const scored: { result: SearchResult; match: AuthenticityMatch }[] = [];

  for (const res of evidence) {
    const text = `${res.title} ${res.snippet} ${res.url}`;
    const match = computeAuthenticity(text, client, nameVariants, phonePatterns);
    
    if (match.score > 0) {
      scored.push({ result: res, match });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.match.score - a.match.score);

  // Aggregate signals across all evidence
  let totalNameMatches = 0;
  let strongNameMatches = 0;  // strength >= 0.8
  let phoneConfirmed = false;
  let emailConfirmed = false;
  let locationConfirmed = false;
  let companyConfirmed = false;
  const allMatchedVariants = new Set<string>();

  for (const item of scored) {
    const m = item.match;
    if (m.nameMatchStrength > 0) {
      totalNameMatches++;
      if (m.nameMatchStrength >= 0.8) strongNameMatches++;
    }
    if (m.phoneMatched) phoneConfirmed = true;
    if (m.emailMatched) emailConfirmed = true;
    if (m.locationMatched) locationConfirmed = true;
    if (m.companyMatched) companyConfirmed = true;
    for (const v of m.matchedVariants) allMatchedVariants.add(v);
  }

  // Calculate final score
  let score = 0;
  const matchedSignals: string[] = [];

  // Name scoring (progressive)
  if (totalNameMatches > 0) {
    score += 40;
    matchedSignals.push(`Nombre detectado en ${totalNameMatches} resultados`);
    
    if (strongNameMatches >= 3) {
      score += 30;
      matchedSignals.push("Fuerte presencia web confirmada (nombre completo en 3+ fuentes)");
    } else if (strongNameMatches >= 2) {
      score += 15;
      matchedSignals.push("Presencia web moderada");
    }
  }

  // Contextual bonuses
  if (companyConfirmed) {
    score += 25;
    matchedSignals.push("Empresa validada en resultados");
  }

  if (locationConfirmed) {
    score += 15;
    matchedSignals.push("Ubicación confirmada");
  }

  if (emailConfirmed) {
    score += 35;
    matchedSignals.push("Email confirmado públicamente");
  }

  if (phoneConfirmed) {
    score += 35;
    matchedSignals.push("Teléfono confirmado públicamente");
  }

  const finalScore = Math.round(Math.min(100, score));

  // Log top matches for debugging
  if (scored.length > 0) {
    console.log(`[Identity] Top 3 matches:`);
    for (const item of scored.slice(0, 3)) {
      console.log(`  Score ${item.match.score}: ${item.result.url.slice(0, 80)} → ${item.match.matchedVariants.join(', ')}`);
    }
  }

  if (finalScore >= VERIFIED_THRESHOLD) {
    return {
      verified: true,
      confidence: finalScore,
      matchedSignals,
      message: `Identidad verificada con ${matchedSignals.length} señales. Score: ${finalScore}%`,
    };
  }

  return {
    verified: false,
    confidence: finalScore,
    matchedSignals,
    message: `Identidad no verificada. Score insuficiente (${finalScore}% < ${VERIFIED_THRESHOLD}%). Señales: ${matchedSignals.join(", ")}`,
  };
}
