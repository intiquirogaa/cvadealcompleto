// ============================================================
// OSINT Platform — Provider Interface
// ============================================================
// Contract that all data providers implement.
// Adding a new provider = creating a file that implements
// this interface + registering it. No existing code changes.
// ============================================================

import type {
  ProviderCategory,
  ProviderCapability,
  ProviderQuery,
  ProviderResult,
  ProviderRuntimeConfig,
} from "../types";

export interface ProviderContext {
  /** HTTP client with timeout, retry, UA rotation */
  httpClient: typeof import("../infrastructure/http-client");
  /** Rate limiter specific to this provider */
  rateLimiter: import("../infrastructure/rate-limiter").TokenBucketRateLimiter;
  /** Circuit breaker for this provider */
  circuitBreaker: import("../infrastructure/circuit-breaker").CircuitBreaker;
  /** Structured logger pre-bound with providerId */
  logger: import("../observability/logger").StructuredLogger;
  /** Provider-specific config from OsintConfig.providers[id] */
  config: ProviderRuntimeConfig;
}

export interface OsintProvider {
  /** Unique identifier, e.g. "bing_api", "linkedin_proxycurl", "newsapi" */
  readonly id: string;

  /** Display name */
  readonly name: string;

  /** What kind of provider this is */
  readonly category: ProviderCategory;

  /** Capabilities this provider offers */
  readonly capabilities: readonly ProviderCapability[];

  /** Provider reliability score (0-100) - updated by reliability tracker */
  readonly reliabilityScore?: number;

  /** Average cost per request in USD */
  readonly costPerRequest?: number;

  /** Provider priority (higher = preferred) */
  readonly priority?: number;

  /** Tags for filtering/discovery */
  readonly tags?: readonly string[];

  /**
   * Execute a search/query against this provider.
   *
   * Implementations should:
   *   1. Check circuitBreaker.canExecute() — fail fast if open
   *   2. Acquire rate limiter slot
   *   3. Execute the actual HTTP request(s) via httpClient
   *   4. Parse/normalize results
   *   5. Record success/failure on circuit breaker
   *   6. Return structured results
   */
  search(query: ProviderQuery, ctx: ProviderContext): Promise<ProviderResult[]>;

  /** Health check — used by circuit breaker and registry */
  healthCheck(ctx?: ProviderContext): Promise<boolean>;

  /** Get current performance metrics for scoring */
  getMetrics?(): Promise<{
    avgLatencyMs: number;
    successRate: number;
    lastSuccessAt?: string;
    errorCount24h: number;
  }>;

  /** Estimate cost for a given query */
  estimateCost?(query: ProviderQuery): number;
}

/**
 * Base class with shared utilities for all providers.
 * Providers can extend this or implement OsintProvider directly.
 */
export abstract class BaseProvider implements OsintProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly category: ProviderCategory;
  abstract readonly capabilities: readonly ProviderCapability[];
  
  readonly reliabilityScore?: number;
  readonly costPerRequest?: number;
  readonly priority?: number;
  readonly tags?: readonly string[];

  abstract search(
    query: ProviderQuery,
    ctx: ProviderContext
  ): Promise<ProviderResult[]>;

  async healthCheck(_ctx?: ProviderContext): Promise<boolean> {
    // Default: assume healthy. Override for real checks.
    return true;
  }

  async getMetrics(): Promise<{
    avgLatencyMs: number;
    successRate: number;
    lastSuccessAt?: string;
    errorCount24h: number;
  }> {
    // Default implementation - providers should override for real metrics
    return {
      avgLatencyMs: 1000,
      successRate: 0.95,
      lastSuccessAt: new Date().toISOString(),
      errorCount24h: 0
    };
  }

  estimateCost(query: ProviderQuery): number {
    return this.costPerRequest || 0;
  }

  /** Helper to build a ProviderResult */
  protected makeResult(
    url: string,
    title: string,
    snippet: string,
    extras?: Partial<ProviderResult>
  ): ProviderResult {
    return {
      url,
      title,
      snippet,
      fetchedAt: new Date().toISOString(),
      ...extras,
    };
  }
}
