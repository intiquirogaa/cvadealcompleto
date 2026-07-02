// ============================================================
// OSINT Intelligence Platform — News Agent
// ============================================================
// Searches for news articles mentioning a person or company
// and creates NewsItem entities.
// ============================================================

import type { AgentInput, AgentOutput, EntityField, NewsItemProperties, NewsCategory } from "../types";
import type { AgentContext } from "./base-agent";
import { BaseAgent } from "./base-agent";
import { AGENT_IDS } from "./agent.registry";
import { extractDomain } from "../infrastructure/normalization";
import { deduplicateResults } from "../infrastructure/dedup";

export class NewsAgent extends BaseAgent {
  readonly id = AGENT_IDS.NEWS;
  readonly name = "News Agent";
  readonly capabilities: readonly EntityField[] = ["company.news"];

  protected async execute(input: AgentInput, ctx: AgentContext): Promise<AgentOutput> {
    const output = this.emptyOutput();
    const hints = input.hints;

    const companyName = hints.companyName as string | undefined;
    const personName = hints.personName as string | undefined;
    const companyEntityId = hints.companyEntityId as string | undefined;
    const personEntityId = hints.personEntityId as string | undefined;

    if (!companyName && !personName) {
      ctx.logger.warn("NewsAgent: missing companyName and personName");
      return output;
    }

    // Build queries
    const queries: string[] = [];
    if (companyName) {
      queries.push(`"${companyName}" noticia`);
      queries.push(`"${companyName}" expansión OR inversión OR premio`);
    }
    if (personName) {
      queries.push(`"${personName}" noticia OR entrevista`);
    }

    const providersUsed = new Set<string>();
    const allResults: Array<{ url: string; title: string; snippet: string; provider: string }> = [];

    for (const queryText of queries) {
      const { results, providersUsed: used } = await this.searchProviders(
        { text: queryText, options: { maxResults: 10 } },
        "news_search",
        ctx,
      );
      // Fallback to web_search if no news_search providers
      let actualResults = results;
      if (results.length === 0) {
        const fallback = await this.searchProviders({ text: queryText }, "web_search", ctx);
        actualResults = fallback.results;
        fallback.providersUsed.forEach((p) => providersUsed.add(p));
      } else {
        used.forEach((p) => providersUsed.add(p));
      }

      for (const r of actualResults) {
        allResults.push({ url: r.url, title: r.title, snippet: r.snippet, provider: used[0] ?? "search" });
      }
      output.metrics.queriesExecuted++;
    }

    const deduped = deduplicateResults(allResults);

    // Create NewsItem entities
    for (const result of deduped.unique.slice(0, 15)) {
      const domain = extractDomain(result.url);
      const category = this.categorizeNews(result.title + " " + result.snippet);

      const newsProps: NewsItemProperties = {
        title: result.title,
        url: result.url,
        source: domain,
        snippet: result.snippet,
        category,
        language: "es",
      };

      const entity = this.makeEntity("news_item", newsProps, ctx.runId, 50);
      output.entities.push(entity);

      // Create MENTIONED_IN relations
      if (companyEntityId) {
        output.relations.push(
          this.makeRelation("MENTIONED_IN", companyEntityId, entity.id, ctx.runId, 50),
        );
      }
      if (personEntityId) {
        output.relations.push(
          this.makeRelation("MENTIONED_IN", personEntityId, entity.id, ctx.runId, 45),
        );
      }

      output.evidence.push(
        this.makeEvidence(
          ctx.runId, result.url, domain,
          "news", result.provider,
          result.title, result.snippet,
          ["news_search", category],
          entity.id,
        ),
      );
    }

    output.metrics.providersUsed = Array.from(providersUsed);
    output.metrics.resultsFound = output.entities.length;

    return output;
  }

  private categorizeNews(text: string): NewsCategory {
    const lower = text.toLowerCase();
    if (/expansi[oó]n|crecimiento|nueva sede|apertura/.test(lower)) return "expansion";
    if (/inversi[oó]n|fondo|capital|ronda/.test(lower)) return "investment";
    if (/premio|reconocimiento|galard[oó]n/.test(lower)) return "award";
    if (/contrat|sumar|nuevo (empleado|director|gerente)/.test(lower)) return "hiring";
    if (/evento|feria|congreso|expo/.test(lower)) return "event";
    if (/entrevista|declar|afirm/.test(lower)) return "interview";
    if (/licitaci[oó]n|licitacion|contrato p[uú]blico/.test(lower)) return "public_tender";
    return "public_mention";
  }
}
