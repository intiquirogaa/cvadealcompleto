// ============================================================
// OSINT Intelligence Platform — Company Agent
// ============================================================
// Searches for company information and creates Company,
// Domain, and Website entities.
// ============================================================

import type { AgentInput, AgentOutput, EntityField, CompanyProperties, DomainProperties, WebsiteProperties } from "../types";
import type { AgentContext } from "./base-agent";
import { BaseAgent } from "./base-agent";
import { AGENT_IDS } from "./agent.registry";
import { normalizeCompanyName, extractDomain } from "../infrastructure/normalization";
import { deduplicateResults } from "../infrastructure/dedup";

export class CompanyAgent extends BaseAgent {
  readonly id = AGENT_IDS.COMPANY;
  readonly name = "Company Agent";
  readonly capabilities: readonly EntityField[] = [
    "company.website", "company.industry", "company.size", "company.news",
  ];

  protected async execute(input: AgentInput, ctx: AgentContext): Promise<AgentOutput> {
    const output = this.emptyOutput();
    const hints = input.hints;

    const companyName = hints.companyName as string | undefined;
    const personEntityId = hints.personEntityId as string | undefined;

    if (!companyName) {
      ctx.logger.warn("CompanyAgent: missing companyName");
      return output;
    }

    const normalizedName = normalizeCompanyName(companyName);

    // Check if company already exists in graph
    const existingCompany = ctx.graph.findCompany(normalizedName);

    // Build search queries
    const queries = [
      { text: `"${companyName}" sitio web` },
      { text: `"${companyName}" industria` },
      { text: `"${companyName}" empleados` },
    ];

    const providersUsed = new Set<string>();
    const allResults: Array<{ url: string; title: string; snippet: string; provider: string }> = [];

    for (const query of queries) {
      const { results, providersUsed: used } = await this.searchProviders(query, "web_search", ctx);
      used.forEach((p) => providersUsed.add(p));
      for (const r of results) {
        allResults.push({ url: r.url, title: r.title, snippet: r.snippet, provider: used[0] ?? "unknown" });
      }
      output.metrics.queriesExecuted++;
    }

    const deduped = deduplicateResults(allResults);

    // Try to extract website/domain from results
    let websiteUrl: string | null = null;
    let domain: string | null = null;

    for (const result of deduped.unique) {
      const resultDomain = extractDomain(result.url);
      // Skip search engines and social media
      if (this.isSearchOrSocialDomain(resultDomain)) continue;

      // Look for the company's official website
      if (
        resultDomain.includes(normalizedName.split(" ")[0].toLowerCase()) ||
        result.title.toLowerCase().includes(companyName.toLowerCase())
      ) {
        websiteUrl = result.url;
        domain = resultDomain;
        break;
      }
    }

    // If no direct match, take the first non-search/social result
    if (!domain) {
      for (const result of deduped.unique) {
        const resultDomain = extractDomain(result.url);
        if (!this.isSearchOrSocialDomain(resultDomain)) {
          domain = resultDomain;
          websiteUrl = result.url;
          break;
        }
      }
    }

    // Create Company entity
    const companyProps: CompanyProperties = {
      name: companyName,
      normalizedName,
      industry: this.extractIndustry(deduped.unique.map((r) => r.snippet)),
    };

    const company = existingCompany ?? this.makeEntity("company", companyProps, ctx.runId);
    if (!existingCompany) output.entities.push(company);

    // Create Domain entity if found
    if (domain) {
      const domainProps: DomainProperties = { domain };
      const domainEntity = this.makeEntity("domain", domainProps, ctx.runId);
      output.entities.push(domainEntity);

      output.relations.push(
        this.makeRelation("OWNS_DOMAIN", company.id, domainEntity.id, ctx.runId, 70),
      );

      // Create Website entity
      if (websiteUrl) {
        const websiteProps: WebsiteProperties = {
          url: websiteUrl,
          title: deduped.unique.find((r) => r.url === websiteUrl)?.title ?? "",
          hasContactPage: false,
          sslValid: websiteUrl.startsWith("https://"),
        };
        const websiteEntity = this.makeEntity("website", websiteProps, ctx.runId);
        output.entities.push(websiteEntity);

        output.relations.push(
          this.makeRelation("HAS_WEBSITE", company.id, websiteEntity.id, ctx.runId, 75),
        );

        output.suggestions.push(
          this.makeSuggestion(
            "fetch_page",
            "high",
            `Fetch company website to extract contact info and social links`,
            { url: websiteUrl, entityId: websiteEntity.id, companyEntityId: company.id },
            "company.website",
          ),
        );
      }
    }

    // Create WORKS_AT relation if person is known
    if (personEntityId) {
      output.relations.push(
        this.makeRelation("WORKS_AT", personEntityId, company.id, ctx.runId, 60),
      );
    }

    // Create evidence records
    for (const result of deduped.unique.slice(0, 10)) {
      output.evidence.push(
        this.makeEvidence(
          ctx.runId, result.url, extractDomain(result.url),
          "search_engine", result.provider,
          result.title, result.snippet, ["company_search"],
          company.id,
        ),
      );
    }

    // Suggest news search
    output.suggestions.push(
      this.makeSuggestion(
        "run_agent", "medium",
        `Search for news about ${companyName}`,
        { agentId: "news", companyName, companyEntityId: company.id },
        "company.news",
      ),
    );

    output.metrics.providersUsed = Array.from(providersUsed);
    output.metrics.resultsFound = output.entities.length;

    return output;
  }

  private isSearchOrSocialDomain(domain: string): boolean {
    const lower = domain.toLowerCase();
    const blocked = ["google.", "bing.", "duckduckgo.", "yahoo.", "facebook.", "twitter.", "linkedin.", "instagram.", "youtube."];
    return blocked.some((b) => lower.includes(b));
  }

  private extractIndustry(snippets: string[]): string | undefined {
    const industryKeywords = [
      "construcción", "inmobiliaria", "tecnología", "software", "finanzas",
      "salud", "educación", "retail", "logística", "energía", "agricultura",
      "turismo", "automotriz", "alimentos", "textil", "minería",
    ];
    const text = snippets.join(" ").toLowerCase();
    return industryKeywords.find((kw) => text.includes(kw));
  }
}
