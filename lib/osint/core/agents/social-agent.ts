// ============================================================
// OSINT Intelligence Platform — Social Agent
// ============================================================
// Searches for social media profiles (LinkedIn, Instagram,
// Facebook, Twitter/X) and creates SocialProfile entities.
// ============================================================

import type { AgentInput, AgentOutput, EntityField, SocialProfileProperties, SocialPlatform, SignalType } from "../types";
import type { AgentContext } from "./base-agent";
import { BaseAgent } from "./base-agent";
import { AGENT_IDS } from "./agent.registry";
import { deduplicateResults, socialProfileDedupKey } from "../infrastructure/dedup";
import { extractDomain, computeNameMatchScore, RESERVED_SOCIAL_PATH_SEGMENTS } from "../infrastructure/normalization";

/** Below this, the profile shows no meaningful resemblance to the lead's name — likely a third party (news outlet, company account) that happened to appear in the search results. */
const LOW_MATCH_CONFIDENCE = 12;
/** Minimum confidence even for a strong match, capped below "verified" until corroborated by other agents. */
const MAX_MATCH_CONFIDENCE = 75;

/**
 * Maps a 0-1 name-match score onto the existing SignalType buckets so it
 * flows through ConfidenceEngine's specificity scoring (SIGNAL_SPECIFICITY
 * in confidence-engine.ts) the same way identity-agent's signals do.
 */
function matchScoreToSignalType(score: number): SignalType {
  if (score >= 0.8) return "surname_rare"; // highest "name-only" specificity bucket available
  if (score >= 0.5) return "full_name_only";
  if (score >= 0.2) return "surname_common";
  return "first_name_only"; // essentially no resemblance — lowest bucket
}

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
    const phone = hints.phone as string | undefined;
    const personEntityId = hints.personEntityId as string | undefined;

    if (!firstName || !lastName) {
      ctx.logger.warn("SocialAgent: missing firstName/lastName");
      return output;
    }

    const fullName = `${firstName} ${lastName}`;
    const providersUsed = new Set<string>();
    const foundProfiles = new Map<string, SocialProfileProperties>();
    // Profiles/posts found specifically via the phone-number query below,
    // as opposed to the name query — a much stronger identity signal (the
    // lead's own already-known phone showing up on the post/bio) than a
    // name-only match, tracked separately so it can carry its own
    // "exact_phone" evidence instead of just folding into the name score.
    const phoneConfirmedKeys = new Set<string>();

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

      // Scoped to facebook.com/instagram.com specifically — unlike a
      // bare phone-number search across the whole web (tried in
      // search-agent.ts and reverted after it mostly surfaced spam/job-board
      // sites echoing the query string back as a fake "reference ID"),
      // restricting to `site:` narrows it to posts/bios/marketplace listings
      // that plausibly belong to the lead, e.g. a Facebook Marketplace ad or
      // an Instagram bio listing a contact number. Only these two platforms:
      // a raw phone number showing up in a LinkedIn/Twitter post is rare
      // enough that the extra query isn't worth it — this doubled
      // SocialAgent's query count (4 → 8) and was observed live pushing a
      // single run to 116s against a 60s budget, causing the whole action
      // to be abandoned by the planner's timeout race and its (real, paid)
      // API calls wasted since the results arrived too late to be merged.
      if (phone && (platform === "facebook" || platform === "instagram")) {
        const phoneQuery = { text: `site:${site} "${phone}"`, options: { maxResults: 5 } };
        const { results: phoneResults, providersUsed: usedForPhone } = await this.searchProviders(phoneQuery, "web_search", ctx);
        usedForPhone.forEach((p) => providersUsed.add(p));
        output.metrics.queriesExecuted++;

        for (const result of phoneResults) {
          const profile = this.parseSocialProfile(result.url, result.title, platform);
          if (profile) {
            const dedupKey = socialProfileDedupKey(profile.url);
            if (!foundProfiles.has(dedupKey)) {
              foundProfiles.set(dedupKey, profile);
            }
            phoneConfirmedKeys.add(dedupKey);
          }
        }
      }
    }

    // Also pick up instagram/facebook profiles other agents already found
    // (typically WebsiteAgent, extracting a link from a news article or the
    // person's own site) but never ran through Apify. Without this, Apify
    // enrichment only ever applies to profiles SocialAgent's own site:
    // search happens to find in this same call — which, in practice, is
    // rarely the winning path once a real profile already exists in the
    // graph (see planner-agent.ts's generateMissingTypeActions gate). This
    // is what the module doc comment at the top of apify-social.provider.ts
    // already describes as the intended behavior.
    for (const entity of ctx.graph.getEntitiesByType("social_profile")) {
      const props = entity.properties as SocialProfileProperties;
      if (props.platform !== "instagram" && props.platform !== "facebook") continue;
      if (typeof props.followers === "number") continue; // already enriched
      const dedupKey = socialProfileDedupKey(props.url);
      if (!foundProfiles.has(dedupKey)) {
        foundProfiles.set(dedupKey, { ...props });
      }
    }

    // Enrich Instagram/Facebook profiles with real page data (bio, followers,
    // following, posts) via Apify — the search step above only has
    // url/username/displayName from the result snippet. Skips other
    // platforms silently (no actor configured for them yet).
    //
    // Bounded to the top MAX_APIFY_ENRICHMENTS candidates by name-match
    // score instead of looping over every profile found: SerpApi surfaces
    // far more instagram.com/facebook.com hits per run than the old noisy
    // scraper did (news outlets' posts, fan pages, unrelated accounts that
    // merely mention the lead), and each Apify call is real money (~$0.01)
    // and real latency (observed up to 60s on a timeout). Unbounded, this
    // made a single investigation blow its configured maxDurationMs by
    // 5x+ in testing (330s against a 60s budget) — the planner has no way
    // to cancel a call already in flight, so the fix has to happen here,
    // at the source, not just in the planner's own timeout handling.
    const MAX_APIFY_ENRICHMENTS = 3;
    const candidates = Array.from(foundProfiles.values())
      .filter((p) => p.platform === "instagram" || p.platform === "facebook")
      .map((profile) => ({
        profile,
        // Deliberately scores `username` only, not `displayName`: for
        // facebook.com/<account>/posts/<slug> results, displayName is the
        // article's headline (e.g. an NYTimes post titled "Satya Nadella
        // says...") which always mentions the lead's name regardless of
        // which account posted it — scoring on it would let every article
        // about the lead through.
        matchScore: computeNameMatchScore(profile.username ?? "", firstName, lastName),
      }))
      .filter(({ matchScore }) => matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, MAX_APIFY_ENRICHMENTS);

    for (const { profile } of candidates) {
      try {
        const execution = await ctx.providers.executeWithFallback(
          { text: profile.url },
          {
            capability: "social_enrichment",
            excludeProviders: ["proxycurl_linkedin"],
            budget: 0.02,
            maxLatency: 65000,
            minReliability: 50,
          },
        );
        output.metrics.queriesExecuted++;
        const enrichment = execution.results[0]?.structuredData as
          | {
              bio?: string; followers?: number; following?: number; posts?: number;
              lastActivityAt?: string; displayName?: string; verified?: boolean;
              isBusinessAccount?: boolean; businessCategory?: string; externalUrl?: string;
              publicEmail?: string; publicPhoneNumber?: string; city?: string;
            }
          | undefined;

        if (enrichment) {
          providersUsed.add(execution.executedProvider);
          if (enrichment.bio) profile.bio = enrichment.bio;
          if (typeof enrichment.followers === "number") profile.followers = enrichment.followers;
          if (typeof enrichment.following === "number") profile.following = enrichment.following;
          if (typeof enrichment.posts === "number") profile.posts = enrichment.posts;
          if (enrichment.lastActivityAt) profile.lastActivityAt = enrichment.lastActivityAt;
          if (enrichment.displayName) profile.displayName = enrichment.displayName;
          if (typeof enrichment.verified === "boolean") profile.verified = enrichment.verified;
          if (typeof enrichment.isBusinessAccount === "boolean") profile.isBusinessAccount = enrichment.isBusinessAccount;
          if (enrichment.businessCategory) profile.businessCategory = enrichment.businessCategory;
          if (enrichment.externalUrl) profile.externalUrl = enrichment.externalUrl;
          if (enrichment.publicEmail) profile.publicEmail = enrichment.publicEmail;
          if (enrichment.publicPhoneNumber) profile.publicPhoneNumber = enrichment.publicPhoneNumber;
          if (enrichment.city) profile.city = enrichment.city;
        }
      } catch (error) {
        ctx.logger.warn("Social profile enrichment failed", {
          url: profile.url,
          platform: profile.platform,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Create entities for found profiles — confidence is driven by how well
    // the profile's username/display name actually resembles the lead's
    // name, not a flat score. A `site:instagram.com "Lionel Messi"` search
    // routinely returns a news outlet's own account (their article just
    // mentions the name) alongside the real profile; without this check
    // both would show up with identical confidence.
    for (const [dedupKey, profile] of foundProfiles.entries()) {
      const candidateText = `${profile.displayName ?? ""} ${profile.username ?? ""}`;
      const matchScore = computeNameMatchScore(candidateText, firstName, lastName);
      let confidence = Math.round(
        LOW_MATCH_CONFIDENCE + matchScore * (MAX_MATCH_CONFIDENCE - LOW_MATCH_CONFIDENCE)
      );
      const matchReason = matchScore >= 0.5
        ? "name_match"
        : matchScore > 0
          ? "partial_name_match"
          : "no_name_match_possible_third_party";

      const isPhoneConfirmed = phoneConfirmedKeys.has(dedupKey);
      if (isPhoneConfirmed) confidence = Math.max(confidence, 80);

      const entity = this.makeEntity("social_profile", profile, ctx.runId, confidence);

      const evidenceProvider = providersUsed.values().next().value ?? "search";
      const evidenceDomain = extractDomain(profile.url);
      const ev = this.makeEvidence(
        ctx.runId, profile.url, evidenceDomain,
        "social_platform", evidenceProvider,
        `${profile.platform} profile: ${profile.displayName ?? profile.username}`,
        `Social profile found for ${fullName}`,
        ["social_search", profile.platform, matchReason],
        entity.id,
      );

      // The final confidence stored on the entity gets recomputed later by
      // ConfidenceEngine.scoreAndUpdateEntities() from entity.evidence — a
      // flat `entity.confidence` set here alone would just get overwritten.
      // The name-match signal has to travel through the same SignalType/
      // specificity mechanism that drives that scoring, or it's discarded.
      entity.evidence.push(
        this.makeEvidenceRef(ev.id, evidenceDomain, evidenceProvider, matchScoreToSignalType(matchScore)),
      );

      // A post/bio that contains the lead's own already-known phone number
      // is a much stronger identity signal than the name-match above —
      // give it its own high-specificity evidence ref (ConfidenceEngine
      // takes the best signal type among all evidence on the entity, see
      // confidence-engine.ts) instead of folding it into the name score.
      if (isPhoneConfirmed) {
        const phoneEv = this.makeEvidence(
          ctx.runId, profile.url, evidenceDomain,
          "social_platform", evidenceProvider,
          `${profile.platform} post/profile mentions the lead's phone number`,
          `Coincide con el teléfono ya conocido de ${fullName}`,
          ["social_search", profile.platform, "phone_match"],
          entity.id,
        );
        output.evidence.push(phoneEv);
        entity.evidence.push(
          this.makeEvidenceRef(phoneEv.id, evidenceDomain, evidenceProvider, "exact_phone"),
        );
      }

      output.entities.push(entity);
      output.evidence.push(ev);

      if (personEntityId) {
        output.relations.push(
          this.makeRelation("HAS_SOCIAL", personEntityId, entity.id, ctx.runId, confidence),
        );
      }
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

      // Better search results surface a lot more instagram.com/facebook.com
      // URLs than before — many are posts/reels/groups, not profile pages,
      // and would otherwise be parsed as if their reserved path segment
      // were someone's username.
      if (RESERVED_SOCIAL_PATH_SEGMENTS[platform]?.includes(username.toLowerCase())) return null;

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
