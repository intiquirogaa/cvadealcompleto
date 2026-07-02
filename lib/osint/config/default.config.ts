// ============================================================
// OSINT Platform — Default Configuration
// ============================================================
// Centralized configuration with sensible defaults.
// Can be overridden per-investigation via InvestigationRequest.options.
// ============================================================

import type { OsintConfig, ProviderRuntimeConfig, ConfidenceWeights, EntityType } from "../core/types";

// ─────────────────────────────────────────────────────────────
// CONFIDENCE WEIGHTS
// ─────────────────────────────────────────────────────────────

export const DEFAULT_CONFIDENCE_WEIGHTS: ConfidenceWeights = {
  sourceReliability: 0.25,
  corroboration: 0.30,
  specificity: 0.20,
  recency: 0.10,
  consistency: 0.15,
};

// ─────────────────────────────────────────────────────────────
// CONFIDENCE THRESHOLDS
// ─────────────────────────────────────────────────────────────

export const DEFAULT_CONFIDENCE_THRESHOLDS = {
  autoUpdateCrm: 80,
  pendingVerification: 60,
  evidenceOnly: 40,
};

// ─────────────────────────────────────────────────────────────
// ENTITY TTL (in seconds)
// ─────────────────────────────────────────────────────────────

export const DEFAULT_ENTITY_TTL: Partial<Record<EntityType, number>> = {
  person: 90 * 24 * 3600,         // 90 days
  company: 60 * 24 * 3600,        // 60 days
  position: 30 * 24 * 3600,       // 30 days
  phone: 45 * 24 * 3600,          // 45 days
  email: 90 * 24 * 3600,          // 90 days
  domain: 365 * 24 * 3600,        // 365 days
  website: 30 * 24 * 3600,        // 30 days
  social_profile: 14 * 24 * 3600, // 14 days
  address: 180 * 24 * 3600,       // 180 days
  // news_item: Infinity — never expires
};

// ─────────────────────────────────────────────────────────────
// PROVIDER DEFAULT CONFIGS
// ─────────────────────────────────────────────────────────────

export const BING_PROVIDER_CONFIG: ProviderRuntimeConfig = {
  enabled: true,
  maxConcurrent: 3,
  requestsPerSecond: 1,
  timeoutMs: 10000,
  maxRetries: 3,
  backoffBaseMs: 1000,
  backoffMaxMs: 30000,
  circuitThreshold: 3,
  circuitCooldownMs: 120000,
  costPerRequestUsd: 0,
};

export const DUCKDUCKGO_PROVIDER_CONFIG: ProviderRuntimeConfig = {
  enabled: true,
  maxConcurrent: 2,
  requestsPerSecond: 0.5,
  timeoutMs: 10000,
  maxRetries: 2,
  backoffBaseMs: 2000,
  backoffMaxMs: 30000,
  circuitThreshold: 3,
  circuitCooldownMs: 120000,
  costPerRequestUsd: 0,
};

export const PAGE_FETCHER_PROVIDER_CONFIG: ProviderRuntimeConfig = {
  enabled: true,
  maxConcurrent: 5,
  requestsPerSecond: 2,
  timeoutMs: 8000,
  maxRetries: 2,
  backoffBaseMs: 1000,
  backoffMaxMs: 15000,
  circuitThreshold: 5,
  circuitCooldownMs: 60000,
  costPerRequestUsd: 0,
};

export const OPENAI_PROVIDER_CONFIG: ProviderRuntimeConfig = {
  enabled: true,
  maxConcurrent: 1,
  requestsPerSecond: 0.5,
  timeoutMs: 30000,
  maxRetries: 2,
  backoffBaseMs: 2000,
  backoffMaxMs: 30000,
  circuitThreshold: 2,
  circuitCooldownMs: 300000,
  costPerRequestUsd: 0.001,
};

// ─────────────────────────────────────────────────────────────
// FULL DEFAULT CONFIG
// ─────────────────────────────────────────────────────────────

export const DEFAULT_OSINT_CONFIG: OsintConfig = {
  // Budgets
  maxCycles: 8,
  maxQueries: 30,
  maxDurationMs: 60000,
  maxCostUsd: 0.50,

  // Confidence
  confidenceThresholds: DEFAULT_CONFIDENCE_THRESHOLDS,
  confidenceWeights: DEFAULT_CONFIDENCE_WEIGHTS,

  // Providers (managed by ProviderFactory)
  providers: {
    // Production API providers (managed automatically)
    bing_search_api: BING_PROVIDER_CONFIG,
    google_cse: PAGE_FETCHER_PROVIDER_CONFIG, // Reuse similar config
    newsapi_org: PAGE_FETCHER_PROVIDER_CONFIG, // Reuse similar config  
    proxycurl_linkedin: OPENAI_PROVIDER_CONFIG, // Reuse similar config for expensive APIs
    web_fetcher: PAGE_FETCHER_PROVIDER_CONFIG,
    
    // Legacy providers (disabled)
    bing: { ...BING_PROVIDER_CONFIG, enabled: false },
    duckduckgo: { ...DUCKDUCKGO_PROVIDER_CONFIG, enabled: false },
    
    // Standard configs
    page_fetcher: PAGE_FETCHER_PROVIDER_CONFIG,
    openai: OPENAI_PROVIDER_CONFIG,
  },

  // Infrastructure
  enableCircuitBreaker: true,
  enableCache: true,
  cacheTtlDays: 7,

  // AI
  aiModel: "gpt-4o-mini",
  aiMaxTokens: 800,
  aiEnabled: true,

  // Memory
  entityTtl: DEFAULT_ENTITY_TTL,
  enableMemoryReuse: true,
};

/**
 * Merge user-provided overrides with defaults.
 * Deep-merges nested objects (providers, confidenceThresholds, etc.)
 */
export function mergeConfig(
  base: OsintConfig,
  overrides?: Partial<OsintConfig>
): OsintConfig {
  if (!overrides) return base;

  return {
    ...base,
    ...overrides,
    confidenceThresholds: {
      ...base.confidenceThresholds,
      ...overrides.confidenceThresholds,
    },
    confidenceWeights: {
      ...base.confidenceWeights,
      ...overrides.confidenceWeights,
    },
    providers: {
      ...base.providers,
      ...overrides.providers,
    },
    entityTtl: {
      ...base.entityTtl,
      ...overrides.entityTtl,
    },
  };
}
