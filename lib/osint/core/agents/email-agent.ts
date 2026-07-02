// ============================================================
// OSINT Intelligence Platform — Email Agent
// ============================================================
// Searches for email addresses associated with a person.
// If the company domain is known, tries common email
// patterns (first.last@domain, flast@domain, etc.).
// ============================================================

import type { AgentInput, AgentOutput, EntityField, EmailProperties } from "../types";
import type { AgentContext } from "./base-agent";
import { BaseAgent } from "./base-agent";
import { AGENT_IDS } from "./agent.registry";
import { normalizeEmail, emailDomain, isCorporateEmail } from "../infrastructure/normalization";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export class EmailAgent extends BaseAgent {
  readonly id = AGENT_IDS.EMAIL;
  readonly name = "Email Agent";
  readonly capabilities: readonly EntityField[] = ["person.email"];

  protected async execute(input: AgentInput, ctx: AgentContext): Promise<AgentOutput> {
    const output = this.emptyOutput();
    const hints = input.hints;

    const firstName = hints.firstName as string | undefined;
    const lastName = hints.lastName as string | undefined;
    const company = hints.company as string | undefined;
    const domain = hints.domain as string | undefined;
    const personEntityId = hints.personEntityId as string | undefined;

    if (!firstName || !lastName) {
      ctx.logger.warn("EmailAgent: missing firstName/lastName");
      return output;
    }

    const fullName = `${firstName} ${lastName}`;
    const providersUsed = new Set<string>();
    const foundEmails = new Set<string>();

    // Strategy 1: Search for emails in web results
    const queries = [
      { text: `"${fullName}" email` },
      { text: `"${fullName}" "@" ${company ?? ""}`.trim() },
    ];

    for (const query of queries) {
      const { results, providersUsed: used } = await this.searchProviders(query, "web_search", ctx);
      used.forEach((p) => providersUsed.add(p));
      const text = results.map((r) => `${r.title} ${r.snippet}`).join(" ");
      const matches = text.match(EMAIL_REGEX) ?? [];
      matches.forEach((m) => foundEmails.add(m.toLowerCase()));
      output.metrics.queriesExecuted++;
    }

    // Strategy 2: If domain is known, try common email patterns
    if (domain) {
      const patterns = this.generateEmailPatterns(firstName, lastName, domain);
      // We can't verify these without sending an email, but we can
      // add them as low-confidence candidates
      for (const pattern of patterns) {
        foundEmails.add(pattern);
      }
    }

    // Create Email entities
    for (const rawEmail of foundEmails) {
      const address = normalizeEmail(rawEmail);
      if (!address) continue;

      const dom = emailDomain(address);
      const isCorp = isCorporateEmail(address);

      const emailProps: EmailProperties = {
        address,
        domain: dom,
        isCorporate: isCorp,
        isDisposable: false,
        isVerified: false,
      };

      const confidence = isCorp ? 50 : 30;
      const entity = this.makeEntity("email", emailProps, ctx.runId, confidence);
      output.entities.push(entity);

      if (personEntityId) {
        output.relations.push(
          this.makeRelation("HAS_EMAIL", personEntityId, entity.id, ctx.runId, confidence),
        );
      }

      output.evidence.push(
        this.makeEvidence(
          ctx.runId, dom, "search_engine",
          "search_engine", Array.from(providersUsed)[0] ?? "search",
          `Email found for ${fullName}`,
          `Extracted email: ${address}`,
          ["email_extraction"],
          entity.id,
        ),
      );
    }

    output.metrics.providersUsed = Array.from(providersUsed);
    output.metrics.resultsFound = output.entities.length;

    return output;
  }

  /**
   * Generate common email patterns for a person at a domain.
   */
  private generateEmailPatterns(firstName: string, lastName: string, domain: string): string[] {
    const f = firstName.toLowerCase();
    const l = lastName.toLowerCase();
    const fl = f[0];
    const d = domain.startsWith("@") ? domain : `@${domain}`;

    return [
      `${f}.${l}${d}`,
      `${f}${l}${d}`,
      `${fl}${l}${d}`,
      `${f}${fl}${d}`,
      `${f}_${l}${d}`,
      `${f}-${l}${d}`,
      `${l}${d}`,
      `${f}${d}`,
    ];
  }
}
