// ============================================================
// OSINT Platform — Provider Factory & Auto-Registration
// ============================================================
// Centralized factory for creating and registering all providers.
// Automatically discovers and registers providers on startup.
// ============================================================

import { providerRegistry } from "./provider.registry";
import type { OsintProvider } from "./provider.interface";
import type { ProviderRuntimeConfig } from "../types";
import { logger } from "../observability/logger";

// Import all providers
import { BingOsintProvider } from "./bing-osint.provider";
import { DuckDuckGoOsintProvider } from "./duckduckgo-osint.provider";
import { BingSearchApiProvider } from "./search/bing-search-api.provider";
import { GoogleCseProvider } from "./search/google-cse.provider";
import { NewsApiProvider } from "./news/newsapi.provider";
import { ProxycurlLinkedInProvider } from "./identity/proxycurl-linkedin.provider";
import { WebFetcherProvider } from "./fetchers/web-fetcher.provider";

// Default configurations for each provider
const PROVIDER_CONFIGS: Record<string, ProviderRuntimeConfig> = {
  // Legacy providers (being phased out)
  bing_legacy: {
    enabled: true, // Enabled as fallback
    maxConcurrent: 2,
    requestsPerSecond: 0.5,
    timeoutMs: 10000,
    maxRetries: 2,
    backoffBaseMs: 2000,
    backoffMaxMs: 30000,
    circuitThreshold: 3,
    circuitCooldownMs: 120000,
    costPerRequestUsd: 0,
    priority: 30
  },

  duckduckgo_legacy: {
    enabled: true, // Enabled as a fallback when API keys are not present
    maxConcurrent: 1,
    requestsPerSecond: 0.3,
    timeoutMs: 15000,
    maxRetries: 2,
    backoffBaseMs: 3000,
    backoffMaxMs: 30000,
    circuitThreshold: 3,
    circuitCooldownMs: 180000,
    costPerRequestUsd: 0,
    priority: 20
  },

  // Production API providers
  bing_search_api: {
    enabled: true,
    maxConcurrent: 5,
    requestsPerSecond: 2,
    timeoutMs: 8000,
    maxRetries: 3,
    backoffBaseMs: 1000,
    backoffMaxMs: 15000,
    circuitThreshold: 5,
    circuitCooldownMs: 60000,
    costPerRequestUsd: 0.001,
    reliabilityScore: 95,
    priority: 90,
    tags: ["official", "fast", "reliable"]
  },

  google_cse: {
    enabled: true,
    maxConcurrent: 3,
    requestsPerSecond: 1,
    timeoutMs: 10000,
    maxRetries: 2,
    backoffBaseMs: 2000,
    backoffMaxMs: 20000,
    circuitThreshold: 3,
    circuitCooldownMs: 120000,
    costPerRequestUsd: 0.005,
    reliabilityScore: 96,
    priority: 85,
    tags: ["google", "high-quality", "structured"]
  },

  newsapi_org: {
    enabled: true,
    maxConcurrent: 4,
    requestsPerSecond: 1.5,
    timeoutMs: 8000,
    maxRetries: 3,
    backoffBaseMs: 1000,
    backoffMaxMs: 15000,
    circuitThreshold: 4,
    circuitCooldownMs: 90000,
    costPerRequestUsd: 0.0001,
    reliabilityScore: 94,
    priority: 85,
    tags: ["news", "real-time", "global"]
  },

  proxycurl_linkedin: {
    enabled: true,
    maxConcurrent: 2,
    requestsPerSecond: 0.5, // Respect rate limits
    timeoutMs: 15000,
    maxRetries: 2,
    backoffBaseMs: 3000,
    backoffMaxMs: 30000,
    circuitThreshold: 2,
    circuitCooldownMs: 300000, // 5 minute cooldown for expensive API
    costPerRequestUsd: 0.02,
    reliabilityScore: 92,
    priority: 75,
    tags: ["linkedin", "premium", "structured", "professional"]
  },

  web_fetcher: {
    enabled: true,
    maxConcurrent: 8,
    requestsPerSecond: 3,
    timeoutMs: 12000,
    maxRetries: 3,
    backoffBaseMs: 1500,
    backoffMaxMs: 20000,
    circuitThreshold: 5,
    circuitCooldownMs: 60000,
    costPerRequestUsd: 0,
    reliabilityScore: 88,
    priority: 80,
    tags: ["web", "content", "free", "structured-data"]
  }
};

export class ProviderFactory {
  private static instance: ProviderFactory;
  private registeredProviders: Map<string, OsintProvider> = new Map();

  private constructor() {}

  static getInstance(): ProviderFactory {
    if (!ProviderFactory.instance) {
      ProviderFactory.instance = new ProviderFactory();
    }
    return ProviderFactory.instance;
  }

  /**
   * Initialize and register all available providers
   */
  async initializeProviders(): Promise<void> {
    logger.info("Initializing OSINT provider ecosystem");

    const providers = this.createAllProviders();
    let registeredCount = 0;

    for (const provider of providers) {
      try {
        await this.registerProvider(provider);
        registeredCount++;
      } catch (error) {
        logger.error("Failed to register provider", {
          providerId: provider.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    logger.info("Provider initialization completed", {
      totalProviders: providers.length,
      registeredProviders: registeredCount,
      failedProviders: providers.length - registeredCount
    });

    // Log summary by category
    this.logProviderSummary();
  }

  /**
   * Create instances of all available providers
   */
  private createAllProviders(): OsintProvider[] {
    return [
      // Legacy providers (disabled by default)
      new BingOsintProvider(),
      new DuckDuckGoOsintProvider(),
      
      // Production API providers
      new BingSearchApiProvider(),
      new GoogleCseProvider(),
      new NewsApiProvider(),
      new ProxycurlLinkedInProvider(),
      new WebFetcherProvider()
    ];
  }

  /**
   * Register a single provider with the registry
   */
  private async registerProvider(provider: OsintProvider): Promise<void> {
    const config = this.getProviderConfig(provider.id);
    
    // Skip if explicitly disabled
    if (!config.enabled) {
      logger.debug("Skipping disabled provider", { providerId: provider.id });
      return;
    }

    // Validate provider before registering
    if (await this.validateProvider(provider, config)) {
      providerRegistry.register(provider, config);
      this.registeredProviders.set(provider.id, provider);
      
      logger.info("Provider registered successfully", {
        providerId: provider.id,
        name: provider.name,
        category: provider.category,
        capabilities: provider.capabilities,
        priority: provider.priority || config.priority
      });
    } else {
      throw new Error(`Provider validation failed: ${provider.id}`);
    }
  }

  /**
   * Validate provider configuration and health
   */
  private async validateProvider(provider: OsintProvider, config: ProviderRuntimeConfig): Promise<boolean> {
    try {
      // Check if required API keys are available for paid providers
      if (provider.costPerRequest && provider.costPerRequest > 0) {
        if (!this.hasRequiredApiKey(provider.id)) {
          logger.warn("Provider missing API key", { 
            providerId: provider.id,
            required: this.getRequiredApiKeyEnvVar(provider.id)
          });
          return false;
        }
      }

      // Basic health check (don't fail registration if health check fails)
      const context = providerRegistry.getContext(provider.id);
      if (context) {
        const isHealthy = await provider.healthCheck(context);
        if (!isHealthy) {
          logger.warn("Provider failed health check but will be registered", { 
            providerId: provider.id 
          });
        }
      }

      return true;
    } catch (error) {
      logger.error("Provider validation error", {
        providerId: provider.id,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Check if provider has required API key
   */
  private hasRequiredApiKey(providerId: string): boolean {
    const envVar = this.getRequiredApiKeyEnvVar(providerId);
    return envVar ? !!process.env[envVar] : true;
  }

  /**
   * Get required environment variable name for API key
   */
  private getRequiredApiKeyEnvVar(providerId: string): string | null {
    const envMap: Record<string, string> = {
      bing_search_api: "BING_API_KEY",
      google_cse: "GOOGLE_CSE_API_KEY",
      newsapi_org: "NEWSAPI_KEY",
      proxycurl_linkedin: "PROXYCURL_API_KEY"
    };
    
    return envMap[providerId] || null;
  }

  /**
   * Get configuration for a provider
   */
  private getProviderConfig(providerId: string): ProviderRuntimeConfig {
    const defaultConfig = PROVIDER_CONFIGS[providerId];
    
    if (!defaultConfig) {
      logger.warn("No default config found for provider, using fallback", { providerId });
      return this.getFallbackConfig();
    }

    // Allow environment variable overrides
    return {
      ...defaultConfig,
      enabled: process.env[`${providerId.toUpperCase()}_ENABLED`] === "false" ? false : defaultConfig.enabled,
      apiKey: process.env[this.getRequiredApiKeyEnvVar(providerId) || ""] || defaultConfig.apiKey
    };
  }

  /**
   * Fallback configuration for unknown providers
   */
  private getFallbackConfig(): ProviderRuntimeConfig {
    return {
      enabled: true,
      maxConcurrent: 2,
      requestsPerSecond: 1,
      timeoutMs: 10000,
      maxRetries: 2,
      backoffBaseMs: 2000,
      backoffMaxMs: 20000,
      circuitThreshold: 3,
      circuitCooldownMs: 120000,
      costPerRequestUsd: 0,
      priority: 50
    };
  }

  /**
   * Log summary of registered providers by category
   */
  private logProviderSummary(): void {
    const stats = providerRegistry.getAllStats();
    const byCategory: Record<string, number> = {};
    const enabledCount = stats.filter(s => s.enabled).length;

    for (const stat of stats) {
      byCategory[stat.category] = (byCategory[stat.category] || 0) + 1;
    }

    logger.info("Provider ecosystem summary", {
      totalRegistered: stats.length,
      enabledProviders: enabledCount,
      byCategory,
      capabilities: this.getAvailableCapabilities()
    });
  }

  /**
   * Get all available capabilities across registered providers
   */
  private getAvailableCapabilities(): string[] {
    const capabilities = new Set<string>();
    
    for (const provider of this.registeredProviders.values()) {
      for (const capability of provider.capabilities) {
        capabilities.add(capability);
      }
    }
    
    return Array.from(capabilities).sort();
  }

  /**
   * Get registered providers by capability
   */
  getProvidersByCapability(capability: string): OsintProvider[] {
    return Array.from(this.registeredProviders.values())
      .filter(provider => provider.capabilities.includes(capability as any));
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): OsintProvider[] {
    return Array.from(this.registeredProviders.values());
  }
}

// Export singleton instance
export const providerFactory = ProviderFactory.getInstance();