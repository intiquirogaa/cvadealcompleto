// ============================================================
// OSINT Platform — DuckDuckGo Provider Adapter
// ============================================================
// Adapts the legacy GoogleProvider (which uses DuckDuckGo) to the
// new OsintProvider interface. Maintains existing logic while
// providing structured interface for the OSINT platform.
// ============================================================

import type {
  ProviderQuery,
  ProviderResult,
} from "../types";
import type { ProviderContext } from "./provider.interface";
import { BaseProvider } from "./provider.interface";
import { GoogleProvider } from "@/lib/enrichment/providers/google.provider";
import { withRateLimit } from "../infrastructure/rate-limiter";
import { withCircuitBreaker } from "../infrastructure/circuit-breaker";

export class DuckDuckGoOsintProvider extends BaseProvider {
  readonly id = "duckduckgo";
  readonly name = "DuckDuckGo Search";
  readonly category = "search_engine" as const;
  readonly capabilities = ["web_search"] as const;

  private legacyProvider = new GoogleProvider();

  async search(query: ProviderQuery, ctx: ProviderContext): Promise<ProviderResult[]> {
    const searchFn = async () => {
      ctx.logger.debug("DuckDuckGo search starting", { query: query.text });
      
      // Use the legacy GoogleProvider (which actually uses DuckDuckGo)
      const legacyResults = await this.legacyProvider.search(query.text);
      
      // Convert legacy format to new ProviderResult format
      const results: ProviderResult[] = legacyResults.map(legacyResult => ({
        url: legacyResult.url,
        title: legacyResult.title || "",
        snippet: legacyResult.snippet || "",
        fetchedAt: new Date().toISOString(),
      }));
      
      ctx.logger.debug("DuckDuckGo search completed", { 
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
    return true; // DuckDuckGo is generally reliable
  }
}