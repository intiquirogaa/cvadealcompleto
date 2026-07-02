// ============================================================
// OSINT Intelligence Platform — Public API
// ============================================================
// This is the entry point for the OSINT module.
// Import from here: `import { ... } from "@/lib/osint"`
// ============================================================

// ── Types ──
export * from "./core/types";

// ── Observability ──
export { logger, createRunLogger } from "./core/observability/logger";
export type { StructuredLogger, LogMeta, LogLevel } from "./core/observability/logger";

// ── Infrastructure ──
export {
  normalizeText,
  stripTags,
  stripHtml,
  decodeHtmlEntities,
  sanitizeSnippet,
  canonicalizeUrl,
  extractDomain,
  canonicalSocialUrl,
  generatePhoneVariants,
  getPhoneDigitPatterns,
  digitsOnly,
  generateNameVariants,
  normalizeEmail,
  emailDomain,
  isCorporateEmail,
  normalizeCompanyName,
  isGenericCompany,
  computeAuthenticity,
} from "./core/infrastructure/normalization";
export type {
  PhoneVariant,
  NameVariant,
  AuthenticityMatch,
} from "./core/infrastructure/normalization";

export {
  TokenBucketRateLimiter,
  withRateLimit,
} from "./core/infrastructure/rate-limiter";
export type { RateLimiterConfig } from "./core/infrastructure/rate-limiter";

export {
  CircuitBreaker,
  withCircuitBreaker,
} from "./core/infrastructure/circuit-breaker";
export type { CircuitState, CircuitBreakerConfig } from "./core/infrastructure/circuit-breaker";

export {
  withRetry,
  isRetryableError,
  computeBackoffDelay,
  DEFAULT_RETRY_CONFIG,
} from "./core/infrastructure/retry";
export type { RetryConfig } from "./core/infrastructure/retry";

export {
  httpFetch,
  fetchPageText,
} from "./core/infrastructure/http-client";
export type { HttpRequestOptions, HttpResponse } from "./core/infrastructure/http-client";

export {
  simHash,
  hammingDistance,
  isContentDuplicate,
  urlDedupKey,
  isSameUrl,
  deduplicateUrls,
  deduplicateResults,
  socialProfileDedupKey,
  getSocialDedupKey,
} from "./core/infrastructure/dedup";
export type { DedupCandidate, DedupResult } from "./core/infrastructure/dedup";

// ── Providers ──
export type { OsintProvider, ProviderContext } from "./core/providers/provider.interface";
export { BaseProvider } from "./core/providers/provider.interface";
export { providerRegistry, ProviderRegistry } from "./core/providers/provider.registry";
export { providerFactory, ProviderFactory } from "./core/providers/provider.factory";
export { providerScoringEngine, ProviderScoringEngine } from "./core/providers/provider.scoring";

// ── Production Providers ──
export { BingSearchApiProvider } from "./core/providers/search/bing-search-api.provider";
export { GoogleCseProvider } from "./core/providers/search/google-cse.provider";
export { NewsApiProvider } from "./core/providers/news/newsapi.provider";
export { ProxycurlLinkedInProvider } from "./core/providers/identity/proxycurl-linkedin.provider";
export { WebFetcherProvider } from "./core/providers/fetchers/web-fetcher.provider";

// ── Config ──
export {
  DEFAULT_OSINT_CONFIG,
  DEFAULT_CONFIDENCE_WEIGHTS,
  DEFAULT_CONFIDENCE_THRESHOLDS,
  DEFAULT_ENTITY_TTL,
  mergeConfig,
} from "./config/default.config";

// ── Persistence (Knowledge Graph) ──
export {
  computeNaturalKey,
  mergeProperties,
  mergeEvidenceRefs,
  mergeEntity,
  mergeConfidenceFactors,
  mergeRelation,
} from "./core/persistence/entity-resolver";

export {
  GraphStore,
  graphStore,
} from "./core/persistence/graph-store";
export type {
  RunRecord,
  CreateRunInput,
  CompleteRunInput,
} from "./core/persistence/graph-store";

export {
  KnowledgeGraph,
} from "./core/persistence/knowledge-graph";
export type { SerializedGraph } from "./core/persistence/knowledge-graph";

// ── Confidence Engine ──
export {
  ProviderReliabilityTracker,
  providerReliabilityTracker,
} from "./core/confidence/provider-reliability";
export type { ProviderReliabilityStats } from "./core/confidence/provider-reliability";

export {
  ConfidenceEngine,
} from "./core/confidence/confidence-engine";
export type {
  ScoringContext,
  ScoringResult,
  ConfidenceLevel,
} from "./core/confidence/confidence-engine";

// ── Memory System ──
export {
  MemoryStore,
  memoryStore,
} from "./core/memory/memory-store";
export type { InvestigationPlan } from "./core/memory/memory-store";

// ── Agents ──
export type { AgentContext, OsintAgent } from "./core/agents/base-agent";
export { BaseAgent } from "./core/agents/base-agent";

export {
  AgentRegistry,
  agentRegistry,
  AGENT_IDS,
} from "./core/agents/agent.registry";
export type { AgentId } from "./core/agents/agent.registry";

export { SearchAgent } from "./core/agents/search-agent";
export { IdentityAgent } from "./core/agents/identity-agent";
export { CompanyAgent } from "./core/agents/company-agent";
export { SocialAgent } from "./core/agents/social-agent";
export { PhoneAgent } from "./core/agents/phone-agent";
export { EmailAgent } from "./core/agents/email-agent";
export { NewsAgent } from "./core/agents/news-agent";
export { WebsiteAgent } from "./core/agents/website-agent";
export { PlannerAgent } from "./core/agents/planner-agent";

// ── OSINT Service (Main Entry Point) ──
export { OsintService } from "./osint.service";
