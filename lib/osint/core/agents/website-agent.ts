// ============================================================
// OSINT Intelligence Platform — Website Agent
// ============================================================
// Fetches a web page and extracts structured data:
// title, description, social links, contact info, emails.
//
// Creates/updates Website entities and generates suggestions
// for found social profiles, emails, and phones.
// ============================================================

import type { AgentInput, AgentOutput, EntityField, WebsiteProperties, SocialProfileProperties, SocialPlatform, SignalType, EvidenceRef } from "../types";
import type { AgentContext } from "./base-agent";
import { BaseAgent } from "./base-agent";
import { AGENT_IDS } from "./agent.registry";
import { fetchPageText } from "../infrastructure/http-client";
import { stripHtml, extractDomain, canonicalizeUrl, normalizeText, computeNameMatchScore, namesAppearNearby, RESERVED_SOCIAL_PATH_SEGMENTS } from "../infrastructure/normalization";

/** Below this, the profile shows no meaningful resemblance to the lead's name — likely the site's own account (e.g. a news outlet's footer social icons), not the person being investigated. */
const LOW_MATCH_CONFIDENCE = 12;
const MAX_MATCH_CONFIDENCE = 75;

/** Maps a 0-1 name-match score onto the SignalType buckets ConfidenceEngine's specificity scoring already understands (see social-agent.ts for the same pattern). */
function matchScoreToSignalType(score: number): SignalType {
  if (score >= 0.8) return "surname_rare";
  if (score >= 0.5) return "full_name_only";
  if (score >= 0.2) return "surname_common";
  return "first_name_only";
}

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
    const firstName = hints.firstName as string | undefined;
    const lastName = hints.lastName as string | undefined;
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

    // Extract social links. Unlike social-agent.ts's own site: search
    // results, this scrapes whatever "platform.com/something" pattern
    // shows up anywhere in the fetched page's raw HTML (nav/footer widgets,
    // og:see-also tags, etc.) — without the same reserved-path-segment
    // check, a generic link like "instagram.com/explore/..." or
    // "facebook.com/groups/..." got treated as if that segment were the
    // lead's own username.
    const foundSocials = new Map<string, SocialProfileProperties>();
    for (const { platform, pattern } of SOCIAL_PATTERNS) {
      const match = html.match(pattern);
      if (match && match[1]) {
        if (RESERVED_SOCIAL_PATH_SEGMENTS[platform]?.includes(match[1].toLowerCase())) continue;
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
      // A fetched page's social links are usually the SITE's own accounts
      // (nav/footer "follow us" widgets), not necessarily the person being
      // investigated — score against the lead's name the same way
      // social-agent.ts does, instead of a flat confidence for every link
      // found on any page. Without a name to compare against, fall back to
      // the original flat confidence with no evidence (matches prior
      // behavior for callers that don't pass firstName/lastName).
      let confidence = 60;
      let evidenceRef: EvidenceRef | null = null;

      if (firstName && lastName) {
        const candidateText = `${profile.displayName ?? ""} ${profile.username ?? ""}`;
        const matchScore = computeNameMatchScore(candidateText, firstName, lastName);
        confidence = Math.round(
          LOW_MATCH_CONFIDENCE + matchScore * (MAX_MATCH_CONFIDENCE - LOW_MATCH_CONFIDENCE)
        );

        const ev = this.makeEvidence(
          ctx.runId, url, domain,
          "social_platform", "page_fetcher",
          `${profile.platform} link found on ${domain}`,
          `Social link extracted from ${url}`,
          ["page_extraction", profile.platform],
        );
        output.evidence.push(ev);
        evidenceRef = this.makeEvidenceRef(ev.id, domain, "page_fetcher", matchScoreToSignalType(matchScore));
      }

      const entity = this.makeEntity("social_profile", profile, ctx.runId, confidence);
      if (evidenceRef) entity.evidence.push(evidenceRef);
      output.entities.push(entity);

      if (personEntityId) {
        output.relations.push(this.makeRelation("HAS_SOCIAL", personEntityId, entity.id, ctx.runId, confidence));
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

    // Extract emails/phones — only from pages that actually mention the
    // target near their name. Without this gate, WebsiteAgent blindly
    // regex-scraped every fetched page regardless of relevance: a fetch
    // suggestion from SearchAgent only ever required the name to appear
    // *somewhere* in a search snippet, so an unrelated page (e.g. a
    // Flickr photo whose caption happened to contain both "Inti" and
    // "Quiroga" in unrelated sentences) would pass through and have its
    // incidental digit runs — in one observed case, literally the photo's
    // ID from its own URL — turned into fake "phone numbers" attached to
    // the lead. firstName/lastName are only available when the caller
    // passes them (see hints above); without them we can't relevance-check,
    // so fall back to the prior best-effort behavior rather than silently
    // extracting nothing.
    const pageIsRelevant = !firstName || !lastName || namesAppearNearby(text, firstName, lastName, 15);

    if (pageIsRelevant) {
      // Digit runs that also appear in the source URL are almost always
      // an ID (photo id, listing id, tracking param), not a phone number —
      // exclude them regardless of relevance, since even a genuinely
      // relevant page can have such IDs in its URL.
      const urlDigits = url.replace(/\D/g, "");

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
        if (digits.length >= 8 && digits.length <= 15 && (urlDigits.length === 0 || !urlDigits.includes(digits))) {
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
    } else {
      ctx.logger.debug("WebsiteAgent: skipping contact extraction, page doesn't clearly mention the target", { url });
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
