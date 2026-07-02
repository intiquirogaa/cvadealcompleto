// ============================================================
// OSINT Intelligence Platform — Search Agent
// ============================================================
// The starting point of any investigation. Generates search
// queries from the target's hints and executes them across
// all healthy search-engine providers.
//
// Returns raw results as evidence records + suggestions for
// the WebsiteAgent to fetch promising pages.
// ============================================================

import type { AgentInput, AgentOutput, EntityField, ProviderQuery } from "../types";
import type { AgentContext } from "./base-agent";
import { BaseAgent } from "./base-agent";
import { AGENT_IDS } from "./agent.registry";
import { generateNameVariants } from "../infrastructure/normalization";
import { deduplicateResults } from "../infrastructure/dedup";
import { extractDomain } from "../infrastructure/normalization";

export class SearchAgent extends BaseAgent {
  readonly id = AGENT_IDS.SEARCH;
  readonly name = "Search Agent";
  readonly capabilities: readonly EntityField[] = [
    "person.profession",
    "person.company", 
    "person.location",
    "company.website"
  ] as any;

  protected async execute(input: AgentInput, ctx: AgentContext): Promise<AgentOutput> {
    const output = this.emptyOutput();
    const hints = input.hints;

    const firstName = hints.firstName as string | undefined;
    const lastName = hints.lastName as string | undefined;
    const company = hints.company as string | undefined;
    const locality = hints.locality as string | undefined;

    if (!firstName || !lastName) {
      ctx.logger.warn("SearchAgent: missing firstName/lastName", { hints });
      return output;
    }

    // Generate search queries
    const queries = this.buildQueries(firstName, lastName, company, locality);
    ctx.logger.debug("SearchAgent: generated queries", { count: queries.length });

    let cacheHits = 0;
    const providersUsed = new Set<string>();
    const allResults: Array<{ url: string; title: string; snippet: string; provider: string }> = [];

    for (const query of queries) {
      const { results, cacheHit, providersUsed: used } = await this.searchProviders(
        query,
        "web_search",
        ctx,
      );

      if (cacheHit) cacheHits++;
      used.forEach((p) => providersUsed.add(p));

      for (const result of results) {
        allResults.push({
          url: result.url,
          title: result.title,
          snippet: result.snippet,
          provider: used[0] ?? "unknown",
        });
      }

      output.metrics.queriesExecuted++;
    }

    // Deduplicate results across queries
    const deduped = deduplicateResults(
      allResults.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.snippet,
        provider: r.provider,
      })),
    );

    // Create evidence records
    for (const result of deduped.unique) {
      const domain = extractDomain(result.url);
      const evidence = this.makeEvidence(
        ctx.runId,
        result.url,
        domain,
        "search_engine",
        result.provider,
        result.title,
        result.snippet,
        ["web_search"],
      );
      output.evidence.push(evidence);

      // Suggest fetching promising pages
      const mentionsTarget = this.mentionsTarget(result.title + " " + result.snippet, firstName, lastName, company);
      if (mentionsTarget) {
        output.suggestions.push(
          this.makeSuggestion(
            "fetch_page",
            mentionsTarget === "strong" ? "high" : "medium",
            `Search result may mention the target: "${result.title.slice(0, 80)}"`,
            { url: result.url, evidenceId: evidence.id },
          ),
        );
      }
    }

    output.metrics.cacheHits = cacheHits;
    output.metrics.providersUsed = Array.from(providersUsed);
    output.metrics.resultsFound = output.evidence.length;

    return output;
  }

  /**
   * Build search queries from available hints.
   * Generates multiple query variations to maximize coverage.
   */
  private buildQueries(
    firstName: string,
    lastName: string,
    company?: string,
    locality?: string,
  ): ProviderQuery[] {
    const queries: ProviderQuery[] = [];
    const variants = generateNameVariants(firstName, lastName);

    // Use the full name variant for most queries
    const fullName = `${firstName} ${lastName}`;

    // 1. Basic name search
    queries.push({ text: `"${fullName}"` });

    // 2. Name + company
    if (company) {
      queries.push({ text: `"${fullName}" "${company}"` });
    }

    // 3. Name + location
    if (locality) {
      queries.push({ text: `"${fullName}" ${locality}` });
    }

    // 4. Name + company + location (most specific)
    if (company && locality) {
      queries.push({ text: `"${fullName}" "${company}" ${locality}` });
    }

    // 5. LinkedIn-specific search
    queries.push({
      text: `site:linkedin.com "${fullName}"`,
      options: { maxResults: 5 },
    });

    // 6. Try a name variant if available (e.g., "J Smith" or initials)
    const variant = variants.find((v) => v.label.includes("inicial"));
    if (variant) {
      queries.push({ text: `"${variant.value}" ${company ?? ""}`.trim() });
    }

    return queries;
  }

  /**
   * Check if a text mentions the target person.
   * Returns "strong" if full name is found, "weak" if only partial.
   */
  private mentionsTarget(
    text: string,
    firstName: string,
    lastName: string,
    company?: string,
  ): "strong" | "weak" | null {
    const lower = text.toLowerCase();
    const full = `${firstName} ${lastName}`.toLowerCase();
    const last = lastName.toLowerCase();

    if (lower.includes(full)) {
      if (company && lower.includes(company.toLowerCase())) return "strong";
      return company ? "weak" : "strong";
    }

    if (lower.includes(last) && lower.includes(firstName.toLowerCase())) {
      return "weak";
    }

    return null;
  }
}
