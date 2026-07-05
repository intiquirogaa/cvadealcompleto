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
import { generateNameVariants, namesAppearNearby } from "../infrastructure/normalization";
import { deduplicateResults } from "../infrastructure/dedup";
import { extractDomain } from "../infrastructure/normalization";

// Domains SocialAgent already owns (its PLATFORM_SITES list) — a direct hit
// on one of these must not become a generic fetch_page/WebsiteAgent
// suggestion. WebsiteAgent has no special handling for these pages: it
// treats them as a generic "website" entity and regex-extracts phone/email
// from the raw (often JS-rendered, anti-bot-gated) HTML, producing noise
// (e.g. a false-positive phone number pulled from Instagram's page source).
// Worse, if the extraction happens to find the *correct* profile link in
// that HTML, it creates a real, high-confidence "social_profile" entity as
// a side effect — which then satisfies the planner's "already have a
// matched social profile" check (planner-agent.ts generateMissingTypeActions)
// and permanently stops SocialAgent (and therefore the Apify enrichment
// wired into it) from ever running for that person. Excluding these domains
// here forces platform profile URLs through SocialAgent's own site: search
// + Apify pipeline instead of a generic, unmanaged page fetch.
const SOCIAL_PLATFORM_DOMAINS = ["linkedin.com", "instagram.com", "facebook.com", "twitter.com", "x.com"];

function isSocialPlatformUrl(url: string): boolean {
  const domain = extractDomain(url);
  return SOCIAL_PLATFORM_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

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
    const email = hints.email as string | undefined;
    const notesLocality = hints.notesLocality as string | undefined;

    if (!firstName || !lastName) {
      ctx.logger.warn("SearchAgent: missing firstName/lastName", { hints });
      return output;
    }

    // Generate search queries
    const queries = this.buildQueries(firstName, lastName, company, locality, email, notesLocality);
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

      // Suggest fetching promising pages — except social platform profile
      // URLs, which SocialAgent owns (see isSocialPlatformUrl above).
      const mentionsTarget = this.mentionsTarget(result.title + " " + result.snippet, firstName, lastName, company);
      if (mentionsTarget && !isSocialPlatformUrl(result.url)) {
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
    email?: string,
    notesLocality?: string,
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

    // 3b. Name + a location mentioned in the CRM notes (e.g. "se muda a
    // Mendoza"), when it differs from the declared locality — catches
    // pages relevant to where the lead is headed, not just where they
    // are now.
    if (notesLocality && notesLocality.trim().toLowerCase() !== (locality ?? "").trim().toLowerCase()) {
      queries.push({ text: `"${fullName}" ${notesLocality}` });
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

    // 7. Exact email search — a page containing the lead's exact,
    // already-known email is far more likely to be genuinely about them
    // (a business directory listing, a leaked-data aggregator, a forum
    // profile) than one that merely contains their name, which commonly
    // collides with unrelated people sharing the name. Previously the
    // client's own contact data, already sitting in the CRM record, was
    // only ever used to *score* evidence found by the generic name
    // search — never to search directly.
    //
    // Deliberately NOT doing the same for a bare phone number: tested
    // live against a real number and it mostly surfaced job-board/listing
    // spam sites that echo back arbitrary numeric query strings as fake
    // "reference IDs" in their URLs (classic SEO bait), not genuine
    // matches — a raw digit string is too easily coincidental across the
    // open web to be a reliable search key on its own.
    if (email && email.includes("@")) {
      queries.push({ text: `"${email}"`, options: { maxResults: 5 } });
    }

    return queries;
  }

  /**
   * Check if a text mentions the target person.
   * Returns "strong" if full name is found, "weak" if only partial.
   *
   * Requires firstName and lastName to appear near each other (see
   * namesAppearNearby) rather than merely somewhere in the same text —
   * a title+snippet blob containing both words in unrelated sentences
   * (a common name collision, e.g. "Inti" as a common Andean word/given
   * name plus "Quiroga" as a common Argentine surname appearing on an
   * unrelated page) previously passed this check and got suggested to
   * WebsiteAgent as if it were about the lead, which then blindly
   * regex-extracted "contact info" from that unrelated page.
   */
  private mentionsTarget(
    text: string,
    firstName: string,
    lastName: string,
    company?: string,
  ): "strong" | "weak" | null {
    const lower = text.toLowerCase();
    const full = `${firstName} ${lastName}`.toLowerCase();

    if (lower.includes(full)) {
      if (company && lower.includes(company.toLowerCase())) return "strong";
      return company ? "weak" : "strong";
    }

    if (namesAppearNearby(text, firstName, lastName)) {
      return "weak";
    }

    return null;
  }
}
