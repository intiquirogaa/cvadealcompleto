// ============================================================
// OSINT Intelligence Platform — Website Agent
// ============================================================
// Fetches a web page and extracts structured data:
// title, description, social links, contact info, emails.
//
// Creates/updates Website entities and generates suggestions
// for found social profiles, emails, and phones.
// ============================================================

import type { AgentInput, AgentOutput, EntityField, WebsiteProperties, SocialProfileProperties, SocialPlatform } from "../types";
import type { AgentContext } from "./base-agent";
import { BaseAgent } from "./base-agent";
import { AGENT_IDS } from "./agent.registry";
import { fetchPageText } from "../infrastructure/http-client";
import { stripHtml, extractDomain, canonicalizeUrl, normalizeText } from "../infrastructure/normalization";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?549?|0)?[\d\s\-().]{8,15}/g;

const SOCIAL_PATTERNS: Array<{ platform: SocialPlatform; pattern: RegExp }> = [
  { platform: "linkedin", pattern: /linkedin\.com\/(?:in|pub|company)\/([a-zA-Z0-9_-]+)/i },
  { platform: "instagram", pattern: /instagram\.com\/([a-zA-Z0-9_.]+)/i },
  { platform: "facebook", pattern: /facebook\.com\/([a-zA-Z0-9.]+)/i },
  { platform: "twitter", pattern: /(?:twitter|x)\.com\/([a-zA-Z0-9_]+)/i },
  { platform: "youtube", pattern: /youtube\.com\/(?:user|channel|c)\/([a-zA-Z0-9_-]+)/i },
];

export class WebsiteAgent extends BaseAgent {
  readonly id = AGENT_IDS.WEBSITE;
  readonly name = "Website Inspection Agent";
  readonly capabilities: readonly EntityField[] = [
    "company.website", "person.linkedin", "person.instagram",
    "person.email", "person.phone",
  ];

  protected async execute(input: AgentInput, ctx: AgentContext): Promise<AgentOutput> {
    const output = this.emptyOutput();
    const hints = input.hints;

    const url = hints.url as string | undefined;
    const entityId = hints.entityId as string | undefined;
    const companyEntityId = hints.companyEntityId as string | undefined;
    const personEntityId = hints.personEntityId as string | undefined;

    if (!url) {
      ctx.logger.warn("WebsiteAgent: missing url");
      return output;
    }

    // Fetch the page
    const html = await fetchPageText(url);
    if (!html) {
      ctx.logger.warn("WebsiteAgent: failed to fetch page", { url });
      return output;
    }

    output.metrics.queriesExecuted = 1;

    const text = stripHtml(html);
    const domain = extractDomain(url);
    const title = this.extractTitle(html);
    const description = this.extractMetaDescription(html);

    // Create/update Website entity
    const websiteProps: WebsiteProperties = {
      url: canonicalizeUrl(url),
      title,
      description,
      hasContactPage: /contact|contacto/i.test(text),
      sslValid: url.startsWith("https://"),
    };

    const website = entityId
      ? ctx.graph.getEntity(entityId) ?? this.makeEntity("website", websiteProps, ctx.runId)
      : this.makeEntity("website", websiteProps, ctx.runId);

    website.properties = websiteProps;
    website.lastVerifiedAt = new Date().toISOString();
    output.entities.push(website);

    output.evidence.push(
      this.makeEvidence(
        ctx.runId, url, domain,
        "corporate_site", "page_fetcher",
        title || url,
        description || text.slice(0, 300),
        ["page_fetch"],
        website.id,
      ),
    );

    // Extract social links
    const foundSocials = new Map<string, SocialProfileProperties>();
    for (const { platform, pattern } of SOCIAL_PATTERNS) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const profileUrl = `https://${platform === "twitter" ? "x.com" : platform + ".com"}/${match[1]}`;
        const dedupKey = `${platform}:${match[1].toLowerCase()}`;
        if (!foundSocials.has(dedupKey)) {
          foundSocials.set(dedupKey, {
            platform,
            url: profileUrl,
            username: match[1],
            displayName: match[1],
          });
        }
      }
    }

    for (const profile of foundSocials.values()) {
      const entity = this.makeEntity("social_profile", profile, ctx.runId, 60);
      output.entities.push(entity);

      if (personEntityId) {
        output.relations.push(this.makeRelation("HAS_SOCIAL", personEntityId, entity.id, ctx.runId, 60));
      }
      if (companyEntityId) {
        output.relations.push(this.makeRelation("HAS_SOCIAL", companyEntityId, entity.id, ctx.runId, 55));
      }

      output.suggestions.push(
        this.makeSuggestion(
          "investigate_entity", "medium",
          `Found ${profile.platform} profile: ${profile.username}`,
          { entityId: entity.id, platform: profile.platform },
          `person.${profile.platform === "twitter" ? "twitter" : profile.platform}` as EntityField,
        ),
      );
    }

    // Extract emails
    const emails = new Set<string>();
    const emailMatches = (html + " " + text).match(EMAIL_REGEX) ?? [];
    for (const email of emailMatches) {
      const lower = email.toLowerCase();
      if (!lower.includes("example.com") && !lower.includes("sentry") && !lower.includes("w3.org")) {
        emails.add(lower);
      }
    }

    for (const email of emails) {
      output.suggestions.push(
        this.makeSuggestion(
          "investigate_entity", "medium",
          `Found email on website: ${email}`,
          { email, sourceUrl: url },
          "person.email",
        ),
      );
    }

    // Extract phone numbers
    const phoneMatches = text.match(PHONE_REGEX) ?? [];
    const phones = new Set<string>();
    for (const phone of phoneMatches) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length >= 8 && digits.length <= 15) {
        phones.add(digits);
      }
    }

    for (const phone of phones) {
      output.suggestions.push(
        this.makeSuggestion(
          "investigate_entity", "low",
          `Found phone on website: ${phone}`,
          { phone, sourceUrl: url },
          "person.phone",
        ),
      );
    }

    output.metrics.resultsFound = output.entities.length + foundSocials.size;

    return output;
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? normalizeText(match[1]).trim() : "";
  }

  private extractMetaDescription(html: string): string | undefined {
    const match = html.match(/<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content=["']([^"']+)["']/i);
    return match ? normalizeText(match[1]).trim() : undefined;
  }
}
