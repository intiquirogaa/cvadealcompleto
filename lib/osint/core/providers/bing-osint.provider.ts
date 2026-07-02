// ============================================================
// OSINT Platform — Bing Provider Adapter
// ============================================================
// Adapts the legacy BingProvider to the new OsintProvider interface.
// Reuses existing HTML scraping logic while providing the new
// structured interface for the OSINT platform.
// ============================================================

import type {
  ProviderQuery,
  ProviderResult,
} from "../types";
import type { ProviderContext } from "./provider.interface";
import { BaseProvider } from "./provider.interface";
import { BingProvider } from "@/lib/enrichment/providers/bing.provider";
import { withRateLimit } from "../infrastructure/rate-limiter";
import { withCircuitBreaker } from "../infrastructure/circuit-breaker";

export class BingOsintProvider extends BaseProvider {
  readonly id = "bing";
  readonly name = "Bing Search";
  readonly category = "search_engine" as const;
  readonly capabilities = ["web_search"] as const;

  private legacyProvider = new BingProvider();

  async search(query: ProviderQuery, ctx: ProviderContext): Promise<ProviderResult[]> {
    const searchFn = async () => {
      ctx.logger.debug("Bing search starting", { query: query.text });
      
      // Use the legacy provider's search method
      const legacyResults = await this.legacyProvider.search(query.text);
      
      // Convert legacy format to new ProviderResult format
      const results: ProviderResult[] = legacyResults.map(legacyResult => ({
        url: legacyResult.url,
        title: legacyResult.title || "",
        snippet: legacyResult.snippet || "",
        fetchedAt: new Date().toISOString(),
      }));
      
      ctx.logger.debug("Bing search completed", { 
        query: query.text, 
        resultsCount: results.length 
      });
      
      return results;
    };

    // Apply rate limiting and circuit breaker
    return await withCircuitBreaker(ctx.circuitBreaker, async () => {
      return await withRateLimit(ctx.rateLimiter, searchFn);
    });
  }

  async healthCheck(): Promise<boolean> {
    return true; // Bing is generally reliable
  }
}