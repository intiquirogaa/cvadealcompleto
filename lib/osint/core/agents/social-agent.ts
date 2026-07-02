// ============================================================
// OSINT Intelligence Platform — Social Agent
// ============================================================
// Searches for social media profiles (LinkedIn, Instagram,
// Facebook, Twitter/X) and creates SocialProfile entities.
// ============================================================

import type { AgentInput, AgentOutput, EntityField, SocialProfileProperties, SocialPlatform } from "../types";
import type { AgentContext } from "./base-agent";
import { BaseAgent } from "./base-agent";
import { AGENT_IDS } from "./agent.registry";
import { deduplicateResults, socialProfileDedupKey } from "../infrastructure/dedup";
import { extractDomain } from "../infrastructure/normalization";

const PLATFORM_SITES: Array<{ platform: SocialPlatform; site: string }> = [
  { platform: "linkedin", site: "linkedin.com" },
  { platform: "instagram", site: "instagram.com" },
  { platform: "facebook", site: "facebook.com" },
  { platform: "twitter", site: "twitter.com" },
];

export class SocialAgent extends BaseAgent {
  readonly id = AGENT_IDS.SOCIAL;
  readonly name = "Social Profile Agent";
  readonly capabilities: readonly EntityField[] = [
    "person.linkedin", "person.twitter", "person.instagram", "person.facebook",
  ];

  protected async execute(input: AgentInput, ctx: AgentContext): Promise<AgentOutput> {
    const output = this.emptyOutput();
    const hints = input.hints;

    const firstName = hints.firstName as string | undefined;
    const lastName = hints.lastName as string | undefined;
    const company = hints.company as string | undefined;
    const personEntityId = hints.personEntityId as string | undefined;

    if (!firstName || !lastName) {
      ctx.logger.warn("SocialAgent: missing firstName/lastName");
      return output;
    }

    const fullName = `${firstName} ${lastName}`;
    const providersUsed = new Set<string>();
    const foundProfiles = new Map<string, SocialProfileProperties>();

    // Search each platform
    for (const { platform, site } of PLATFORM_SITES) {
      const query = { text: `site:${site} "${fullName}"`, options: { maxResults: 5 } };
      const { results, providersUsed: used } = await this.searchProviders(query, "web_search", ctx);
      used.forEach((p) => providersUsed.add(p));
      output.metrics.queriesExecuted++;

      for (const result of results) {
        const profile = this.parseSocialProfile(result.url, result.title, platform);
        if (profile) {
          const dedupKey = socialProfileDedupKey(profile.url);
          if (!foundProfiles.has(dedupKey)) {
            foundProfiles.set(dedupKey, profile);
          }
        }
      }
    }

    // Create entities for found profiles
    for (const profile of foundProfiles.values()) {
      const entity = this.makeEntity("social_profile", profile, ctx.runId, 50);
      output.entities.push(entity);

      if (personEntityId) {
        output.relations.push(
          this.makeRelation("HAS_SOCIAL", personEntityId, entity.id, ctx.runId, 55),
        );
      }

      output.evidence.push(
        this.makeEvidence(
          ctx.runId, profile.url, extractDomain(profile.url),
          "social_platform", providersUsed.values().next().value ?? "search",
          `${profile.platform} profile: ${profile.displayName ?? profile.username}`,
          `Social profile found for ${fullName}`,
          ["social_search", profile.platform],
          entity.id,
        ),
      );
    }

    output.metrics.providersUsed = Array.from(providersUsed);
    output.metrics.resultsFound = output.entities.length;

    return output;
  }

  private parseSocialProfile(url: string, title: string, platform: SocialPlatform): SocialProfileProperties | null {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);

      // LinkedIn: linkedin.com/in/username
      // Instagram: instagram.com/username
      // Facebook: facebook.com/username
      // Twitter: twitter.com/username
      if (pathParts.length === 0) return null;

      // Skip non-profile pages
      if (platform === "linkedin" && pathParts[0] !== "in" && pathParts[0] !== "pub") return null;
      const username = platform === "linkedin" ? pathParts[1] : pathParts[0];
      if (!username || username.length < 2) return null;

      return {
        platform,
        url: url,
        username,
        displayName: title.split("|")[0].trim() || username,
      };
    } catch {
      return null;
    }
  }
}
