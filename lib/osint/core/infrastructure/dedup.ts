// ============================================================
// OSINT Platform — Deduplication Utilities
// ============================================================
// Three-layer deduplication:
//   1. URL canonicalization (exact match after normalization)
//   2. Content SimHash (fuzzy text similarity)
//   3. Entity-level merge (same social profile from different providers)
// ============================================================

import { canonicalizeUrl, canonicalSocialUrl, extractDomain } from "./normalization";

// ─────────────────────────────────────────────────────────────
// LAYER 1: URL Deduplication
// ─────────────────────────────────────────────────────────────

/**
 * Build a dedup key from a URL by canonicalizing it.
 * Two URLs with the same dedup key refer to the same page.
 */
export function urlDedupKey(rawUrl: string): string {
  return canonicalizeUrl(rawUrl).toLowerCase();
}

/**
 * Check if two URLs are the same resource after canonicalization.
 */
export function isSameUrl(urlA: string, urlB: string): boolean {
  return urlDedupKey(urlA) === urlDedupKey(urlB);
}

/**
 * Deduplicate an array of URLs, keeping the first occurrence.
 * Returns a map from dedup key → original URL.
 */
export function deduplicateUrls(urls: string[]): Map<string, string> {
  const seen = new Map<string, string>();
  for (const url of urls) {
    const key = urlDedupKey(url);
    if (!seen.has(key)) {
      seen.set(key, url);
    }
  }
  return seen;
}

// ─────────────────────────────────────────────────────────────
// LAYER 2: Content SimHash
// ─────────────────────────────────────────────────────────────

/**
 * Compute a 64-bit SimHash of a text string.
 * SimHash produces similar hashes for similar texts,
 * so duplicates can be detected via Hamming distance.
 *
 * Algorithm:
 *   1. Tokenize text into shingles (3-char sliding window)
 *   2. Hash each shingle to 64 bits
 *   3. For each bit position, sum +1 if the bit is 1, -1 if 0
 *   4. Final hash: bit is 1 if sum > 0, else 0
 */
export function simHash(text: string): bigint {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (normalized.length < 3) return 0n;

  // Generate 3-character shingles
  const shingles: string[] = [];
  for (let i = 0; i <= normalized.length - 3; i++) {
    shingles.push(normalized.slice(i, i + 3));
  }

  if (shingles.length === 0) return 0n;

  // Accumulate bit votes
  const bitSums = new Int32Array(64);

  for (const shingle of shingles) {
    const hash = hashStringToBigInt(shingle);
    for (let bit = 0; bit < 64; bit++) {
      const bitValue = (hash >> BigInt(bit)) & 1n;
      bitSums[bit] += bitValue === 1n ? 1 : -1;
    }
  }

  // Build final hash
  let result = 0n;
  for (let bit = 0; bit < 64; bit++) {
    if (bitSums[bit] > 0) {
      result |= 1n << BigInt(bit);
    }
  }

  return result;
}

/** Simple string hash to BigInt (FNV-1a inspired) */
function hashStringToBigInt(str: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash;
}

/**
 * Compute the Hamming distance between two SimHashes.
 * Lower distance = more similar content.
 */
export function hammingDistance(hashA: bigint, hashB: bigint): number {
  let xor = hashA ^ hashB;
  let count = 0;
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}

/**
 * Check if two texts are likely duplicates based on SimHash.
 * Threshold: Hamming distance ≤ 3 means ~94%+ similarity.
 */
export function isContentDuplicate(
  textA: string,
  textB: string,
  threshold: number = 3
): boolean {
  const hashA = simHash(textA);
  const hashB = simHash(textB);
  if (hashA === 0n || hashB === 0n) return false;
  return hammingDistance(hashA, hashB) <= threshold;
}

// ─────────────────────────────────────────────────────────────
// LAYER 3: Entity-Level Dedup (Social Profiles)
// ─────────────────────────────────────────────────────────────

/**
 * Build a dedup key for a social profile URL.
 * Two results with the same key refer to the same social profile
 * (even if found via different search engines).
 *
 * e.g. https://linkedin.com/in/juanperez and
 *      https://www.linkedin.com/in/juanperez/ both →
 *      "linkedin.com/in/juanperez"
 */
export function socialProfileDedupKey(url: string): string {
  return canonicalSocialUrl(url);
}

/**
 * Detect if a URL is a social profile and return its dedup key.
 * Returns null for non-social URLs.
 */
const SOCIAL_DOMAINS = [
  "linkedin.com/in/",
  "linkedin.com/pub/",
  "instagram.com/",
  "facebook.com/",
  "twitter.com/",
  "x.com/",
  "github.com/",
  "youtube.com/",
  "tiktok.com/",
  "reddit.com/user/",
];

export function getSocialDedupKey(url: string): string | null {
  const canonical = canonicalSocialUrl(url);
  for (const domain of SOCIAL_DOMAINS) {
    if (canonical.includes(domain)) {
      return canonical;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// COMBINED DEDUP MANAGER
// ─────────────────────────────────────────────────────────────

export interface DedupCandidate {
  url: string;
  title: string;
  snippet: string;
  provider: string;
}

export interface DedupResult {
  /** Unique candidates after deduplication */
  unique: DedupCandidate[];
  /** Number of duplicates removed */
  removedCount: number;
  /** Map of dedup key → list of providers that found it (corroboration) */
  corroborationMap: Map<string, string[]>;
}

/**
 * Full deduplication pipeline for a batch of search results.
 * Applies URL dedup → content SimHash → entity-level merge.
 * Tracks which providers found each result (for corroboration scoring).
 */
export function deduplicateResults(
  candidates: DedupCandidate[]
): DedupResult {
  const corroborationMap = new Map<string, string[]>();
  const seenUrlKeys = new Set<string>();
  const seenContentHashes: Array<{ hash: bigint; key: string }> = [];
  const unique: DedupCandidate[] = [];
  let removedCount = 0;

  for (const candidate of candidates) {
    // Layer 1: URL dedup
    const urlKey = urlDedupKey(candidate.url);
    if (seenUrlKeys.has(urlKey)) {
      // Already seen — just add provider to corroboration
      const providers = corroborationMap.get(urlKey) || [];
      if (!providers.includes(candidate.provider)) {
        providers.push(candidate.provider);
        corroborationMap.set(urlKey, providers);
      }
      removedCount++;
      continue;
    }

    // Layer 2: Content SimHash dedup
    const contentText = `${candidate.title} ${candidate.snippet}`;
    const contentHash = simHash(contentText);
    let isDup = false;
    let dupKey = "";

    for (const existing of seenContentHashes) {
      if (hammingDistance(contentHash, existing.hash) <= 3) {
        isDup = true;
        dupKey = existing.key;
        break;
      }
    }

    if (isDup) {
      // Content duplicate — merge providers
      const providers = corroborationMap.get(dupKey) || [];
      if (!providers.includes(candidate.provider)) {
        providers.push(candidate.provider);
        corroborationMap.set(dupKey, providers);
      }
      removedCount++;
      continue;
    }

    // Not a duplicate — add to unique results
    seenUrlKeys.add(urlKey);
    seenContentHashes.push({ hash: contentHash, key: urlKey });
    corroborationMap.set(urlKey, [candidate.provider]);
    unique.push(candidate);
  }

  return { unique, removedCount, corroborationMap };
}
