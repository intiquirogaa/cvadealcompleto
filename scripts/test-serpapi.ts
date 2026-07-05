import { SerpApiProvider } from "../lib/osint/core/providers/search/serpapi.provider";
import { TokenBucketRateLimiter } from "../lib/osint/core/infrastructure/rate-limiter";
import { CircuitBreaker } from "../lib/osint/core/infrastructure/circuit-breaker";
import { createRunLogger } from "../lib/osint/core/observability/logger";
import * as httpClient from "../lib/osint/core/infrastructure/http-client";
import type { ProviderContext } from "../lib/osint/core/providers/provider.interface";
import type { ProviderRuntimeConfig } from "../lib/osint/core/types";

async function main() {
  const provider = new SerpApiProvider();

  const config: ProviderRuntimeConfig = {
    enabled: true,
    maxConcurrent: 3,
    requestsPerSecond: 1,
    timeoutMs: 12000,
    maxRetries: 2,
    backoffBaseMs: 2000,
    backoffMaxMs: 20000,
    circuitThreshold: 3,
    circuitCooldownMs: 120000,
  };

  const ctx: ProviderContext = {
    httpClient,
    rateLimiter: new TokenBucketRateLimiter("serpapi", config),
    circuitBreaker: new CircuitBreaker("serpapi", config),
    logger: createRunLogger("test-trace", "test-run"),
    config,
  };

  console.log("healthCheck:", await provider.healthCheck(ctx));

  const query = process.argv[2] || "Satya Nadella Microsoft";
  console.log(`\nQuerying: ${query}`);
  const results = await provider.search({ text: query, options: { maxResults: 5 } }, ctx);
  console.log(`Results (${results.length}):`, JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
