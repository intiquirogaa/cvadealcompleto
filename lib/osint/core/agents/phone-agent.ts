// ============================================================
// OSINT Intelligence Platform — Phone Agent
// ============================================================
// Searches for phone numbers associated with a person or
// company.  Extracts phone numbers from search results
// using regex and creates Phone entities with variants.
// ============================================================

import type { AgentInput, AgentOutput, EntityField, PhoneProperties } from "../types";
import type { AgentContext } from "./base-agent";
import { BaseAgent } from "./base-agent";
import { AGENT_IDS } from "./agent.registry";
import { digitsOnly, generatePhoneVariants, extractDomain } from "../infrastructure/normalization";
import { deduplicateResults } from "../infrastructure/dedup";

// Regex for Argentine and international phone numbers
const PHONE_REGEX = /(?:\+?549?|0)?(?:11|15)?\s?[\d\s\-().]{8,15}/g;

export class PhoneAgent extends BaseAgent {
  readonly id = AGENT_IDS.PHONE;
  readonly name = "Phone Agent";
  readonly capabilities: readonly EntityField[] = ["person.phone"];

  protected async execute(input: AgentInput, ctx: AgentContext): Promise<AgentOutput> {
    const output = this.emptyOutput();
    const hints = input.hints;

    const firstName = hints.firstName as string | undefined;
    const lastName = hints.lastName as string | undefined;
    const company = hints.company as string | undefined;
    const locality = hints.locality as string | undefined;
    const personEntityId = hints.personEntityId as string | undefined;

    if (!firstName || !lastName) {
      ctx.logger.warn("PhoneAgent: missing firstName/lastName");
      return output;
    }

    const fullName = `${firstName} ${lastName}`;
    const queries = [
      { text: `"${fullName}" teléfono` },
      { text: `"${fullName}" contacto` },
    ];
    if (company) queries.push({ text: `"${company}" teléfono contacto` });

    const providersUsed = new Set<string>();
    const allSnippets: string[] = [];

    for (const query of queries) {
      const { results, providersUsed: used } = await this.searchProviders(query, "web_search", ctx);
      used.forEach((p) => providersUsed.add(p));
      for (const r of results) allSnippets.push(`${r.title} ${r.snippet}`);
      output.metrics.queriesExecuted++;
    }

    // Extract phone numbers from snippets
    const foundPhones = new Set<string>();
    const text = allSnippets.join(" ");
    const matches = text.match(PHONE_REGEX) ?? [];

    for (const match of matches) {
      const digits = digitsOnly(match);
      if (digits.length >= 8 && digits.length <= 15) {
        foundPhones.add(digits);
      }
    }

    // Create Phone entities
    for (const phoneDigits of foundPhones) {
      const variants = generatePhoneVariants(phoneDigits);
      const phoneProps: PhoneProperties = {
        raw: phoneDigits,
        digits: phoneDigits,
        country: "AR",
        variants: variants.map((v) => v.value),
        type: "unknown",
      };

      const entity = this.makeEntity("phone", phoneProps, ctx.runId, 40);
      output.entities.push(entity);

      if (personEntityId) {
        output.relations.push(
          this.makeRelation("HAS_PHONE", personEntityId, entity.id, ctx.runId, 45),
        );
      }

      output.evidence.push(
        this.makeEvidence(
          ctx.runId, "search_results", "search_engine",
          "search_engine", Array.from(providersUsed)[0] ?? "search",
          `Phone found for ${fullName}`,
          `Extracted phone: ${phoneDigits}`,
          ["phone_extraction"],
          entity.id,
        ),
      );
    }

    output.metrics.providersUsed = Array.from(providersUsed);
    output.metrics.resultsFound = output.entities.length;

    return output;
  }
}
