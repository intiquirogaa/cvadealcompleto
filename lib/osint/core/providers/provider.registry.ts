// ============================================================
// OSINT Platform — Provider Registry
// ============================================================
// Plugin registry for data providers. Providers register
// themselves at startup; agents discover providers by
// capability or category.
//
// Adding a new provider:
//   1. Create file: lib/osint/core/providers/search/myprovider.ts
//   2. Implement OsintProvider interface
//   3. Register: registry.register(new MyProvider(), config)
//
// No existing code is modified. The planner and agents
// automatically discover and use the new provider.
// ============================================================

import type {
  ProviderCategory,
  ProviderCapability,
  ProviderRuntimeConfig,
  ProviderSelectionContext,
  ProviderScore,
  ProviderExecutionResult
} from "../types";
import type { OsintProvider, ProviderContext } from "./provider.interface";
import { providerScoringEngine } from "./provider.scoring";
import { TokenBucketRateLimiter } from "../infrastructure/rate-limiter";
import { CircuitBreaker } from "../infrastructure/circuit-breaker";
import { logger as rootLogger } from "../observability/logger";
import * as httpClientModule from "../infrastructure/http-client";

interface RegisteredProvider {
  provider: OsintProvider;
  config: ProviderRuntimeConfig;
  rateLimiter: TokenBucketRateLimiter;
  circuitBreaker: CircuitBreaker;
}

export class ProviderRegistry {
  private providers = new Map<string, RegisteredProvider>();

  /**
   * Register a provider with its runtime configuration.
   * Creates the rate limiter and circuit breaker for this provider.
   */
  register(provider: OsintProvider, config: ProviderRuntimeConfig): void {
    if (this.providers.has(provider.id)) {
      rootLogger.warn("Provider already registered, overwriting", {
        providerId: provider.id,
      });
    }

    const rateLimiter = new TokenBucketRateLimiter(provider.id, {
      maxConcurrent: config.maxConcurrent,
      requestsPerSecond: config.requestsPerSecond,
    });

    const circuitBreaker = new CircuitBreaker(provider.id, {
      threshold: config.circuitThreshold,
      cooldownMs: config.circuitCooldownMs,
    });

    this.providers.set(provider.id, {
      provider,
      config,
      rateLimiter,
      circuitBreaker,
    });

    rootLogger.info("Provider registered", {
      providerId: provider.id,
      name: provider.name,
      category: provider.category,
      capabilities: provider.capabilities,
      enabled: config.enabled,
    });
  }

  /** Unregister a provider */
  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  /** Get a provider by ID */
  get(providerId: string): OsintProvider | null {
    return this.providers.get(providerId)?.provider ?? null;
  }

  /** Get the runtime context for a provider (rate limiter, circuit breaker, etc.) */
  getContext(providerId: string): ProviderContext | null {
    const registered = this.providers.get(providerId);
    if (!registered) return null;

    return {
      httpClient: httpClientModule,
      rateLimiter: registered.rateLimiter,
      circuitBreaker: registered.circuitBreaker,
      logger: rootLogger.child({ providerId }),
      config: registered.config,
    };
  }

  /** Find providers by capability */
  findByCapability(capability: ProviderCapability): OsintProvider[] {
    return Array.from(this.providers.values())
      .filter((r) => r.config.enabled && r.provider.capabilities.includes(capability))
      .map((r) => r.provider);
  }

  /** Find providers by category */
  findByCategory(category: ProviderCategory): OsintProvider[] {
    return Array.from(this.providers.values())
      .filter((r) => r.config.enabled && r.provider.category === category)
      .map((r) => r.provider);
  }

  /**
   * Get all healthy (enabled + circuit closed) providers
   * that offer the requested capability.
   */
  getHealthy(task: ProviderCapability): OsintProvider[] {
    return Array.from(this.providers.values())
      .filter(
        (r) =>
          r.config.enabled &&
          r.provider.capabilities.includes(task) &&
          r.circuitBreaker.getState() !== "open"
      )
      .map((r) => r.provider);
  }

  /**
   * SMART PROVIDER SELECTION
   * Select the best provider(s) for a capability using scoring system.
   * Returns ordered list of providers to try (with fallback chain).
   */
  async selectProviders(context: ProviderSelectionContext): Promise<{
    primary: OsintProvider;
    fallbacks: OsintProvider[];
    scores: ProviderScore[];
    reasoning: string;
  }> {
    const healthyProviders = this.getHealthy(context.capability);
    
    if (healthyProviders.length === 0) {
      throw new Error(`No healthy providers available for capability: ${context.capability}`);
    }

    // Score all providers
    const scores = await providerScoringEngine.scoreProviders(healthyProviders, context);
    
    if (scores.length === 0) {
      throw new Error(`No providers meet the selection criteria for: ${context.capability}`);
    }

    const primary = this.get(scores[0].providerId)!;
    const fallbacks = scores.slice(1, 4).map(s => this.get(s.providerId)!).filter(Boolean);
    
    const reasoning = `Selected ${primary.name} (score: ${scores[0].totalScore.toFixed(1)}) with ${fallbacks.length} fallbacks`;

    return { primary, fallbacks, scores, reasoning };
  }

  /**
   * EXECUTE WITH AUTOMATIC FALLBACK
   * Execute a query with automatic fallback to alternative providers.
   * Returns result from the first successful provider.
   */
  async executeWithFallback(
    query: import("../types").ProviderQuery,
    context: ProviderSelectionContext
  ): Promise<{
    results: import("../types").ProviderResult[];
    executedProvider: string;
    executionResults: ProviderExecutionResult[];
    fallbacksUsed: number;
  }> {
    const selection = await this.selectProviders(context);
    const allProviders = [selection.primary, ...selection.fallbacks];
    const executionResults: ProviderExecutionResult[] = [];
    
    for (const provider of allProviders) {
      const startTime = Date.now();
      const providerContext = this.getContext(provider.id);
      
      if (!providerContext) {
        executionResults.push({
          providerId: provider.id,
          success: false,
          durationMs: 0,
          results: [],
          error: "Provider context not available"
        });
        continue;
      }

      try {
        const results = await provider.search(query, providerContext);
        const durationMs = Date.now() - startTime;
        
        const executionResult: ProviderExecutionResult = {
          providerId: provider.id,
          success: true,
          durationMs,
          results,
          cost: provider.estimateCost ? provider.estimateCost(query) : provider.costPerRequest || 0
        };
        
        executionResults.push(executionResult);
        
        // Log successful execution
        providerScoringEngine.logDecision(
          context.capability,
          [selection.primary.id],
          selection.fallbacks.map(f => f.id),
          executionResults,
          provider.id
        );
        
        return {
          results,
          executedProvider: provider.id,
          executionResults,
          fallbacksUsed: executionResults.length - 1
        };
        
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const executionResult: ProviderExecutionResult = {
          providerId: provider.id,
          success: false,
          durationMs,
          results: [],
          error: error instanceof Error ? error.message : String(error)
        };
        
        executionResults.push(executionResult);
        
        rootLogger.warn("Provider execution failed, trying next", {
          providerId: provider.id,
          error: executionResult.error,
          durationMs
        });
      }
    }
    
    // All providers failed
    providerScoringEngine.logDecision(
      context.capability,
      [selection.primary.id],
      selection.fallbacks.map(f => f.id),
      executionResults,
      "none"
    );
    
    throw new Error(`All providers failed for capability ${context.capability}. Tried: ${allProviders.map(p => p.id).join(", ")}`);
  }

  /** Check if a provider is healthy (circuit not open) */
  isHealthy(providerId: string): boolean {
    const registered = this.providers.get(providerId);
    if (!registered) return false;
    return (
      registered.config.enabled &&
      registered.circuitBreaker.getState() !== "open"
    );
  }

  /** Get all registered provider IDs */
  getRegisteredIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /** Get stats for all providers (for observability dashboard) */
  getAllStats(): Array<{
    id: string;
    name: string;
    category: ProviderCategory;
    enabled: boolean;
    circuitState: string;
    rateLimiter: ReturnType<TokenBucketRateLimiter["getStats"]>;
    circuitBreaker: ReturnType<CircuitBreaker["getStats"]>;
  }> {
    return Array.from(this.providers.values()).map((r) => ({
      id: r.provider.id,
      name: r.provider.name,
      category: r.provider.category,
      enabled: r.config.enabled,
      circuitState: r.circuitBreaker.getState(),
      rateLimiter: r.rateLimiter.getStats(),
      circuitBreaker: r.circuitBreaker.getStats(),
    }));
  }
}

/** Singleton registry instance */
export const providerRegistry = new ProviderRegistry();
