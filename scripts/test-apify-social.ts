import { ApifySocialProvider } from "../lib/osint/core/providers/social/apify-social.provider";
import { TokenBucketRateLimiter } from "../lib/osint/core/infrastructure/rate-limiter";
import { CircuitBreaker } from "../lib/osint/core/infrastructure/circuit-breaker";
import { createRunLogger } from "../lib/osint/core/observability/logger";
import * as httpClient from "../lib/osint/core/infrastructure/http-client";
import type { ProviderContext } from "../lib/osint/core/providers/provider.interface";
import type { ProviderRuntimeConfig } from "../lib/osint/core/types";

async function main() {
  const provider = new ApifySocialProvider();

  const config: ProviderRuntimeConfig = {
    enabled: true,
    maxConcurrent: 1,
    requestsPerSecond: 0.3,
    timeoutMs: 60000,
    maxRetries: 1,
    backoffBaseMs: 3000,
    backoffMaxMs: 30000,
    circuitThreshold: 2,
    circuitCooldownMs: 300000,
  };

  const ctx: ProviderContext = {
    httpClient,
    rateLimiter: new TokenBucketRateLimiter("apify_social", config),
    circuitBreaker: new CircuitBreaker("apify_social", config),
    logger: createRunLogger("test-trace", "test-run"),
    config,
  };

  console.log("healthCheck:", await provider.healthCheck(ctx));

  const url = process.argv[2] || "https://www.instagram.com/leomessi/";
  console.log(`\nQuerying: ${url}`);
  const results = await provider.search({ text: url }, ctx);
  console.log("Results:", JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
