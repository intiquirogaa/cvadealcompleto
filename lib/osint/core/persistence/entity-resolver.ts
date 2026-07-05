// ============================================================
// OSINT Intelligence Platform — Entity Resolver
// ============================================================
// Matches incoming evidence to existing entities in the Knowledge
// Graph using deterministic "natural keys".  When a match is found,
// properties are merged field-by-field (existing values are kept
// unless empty; arrays are unioned).
// ============================================================

import type {
  EntityType,
  EntityProperties,
  GraphEntity,
  GraphRelation,
  EvidenceRef,
  ConfidenceFactors,
  PersonProperties,
  CompanyProperties,
  PositionProperties,
  PhoneProperties,
  EmailProperties,
  DomainProperties,
  WebsiteProperties,
  SocialProfileProperties,
  AddressProperties,
  NewsItemProperties,
} from "../types";

import {
  canonicalizeUrl,
  digitsOnly,
  normalizeCompanyName,
  normalizeText,
} from "../infrastructure/normalization";

// ─────────────────────────────────────────────────────────────
// 1. Natural Key Computation
// ─────────────────────────────────────────────────────────────

/**
 * Compute a deterministic natural key for an entity based on its
 * type and properties.  Two entities with the same type and same
 * natural key are considered the same entity (subject to merge).
 *
 * Format: `${type}:${deterministicKeyValue}`
 *
 * `crmClientId` scopes the key for entity types that represent facts
 * about ONE SPECIFIC lead (person/phone/email/social_profile/address/
 * position). Without it, graph-store.ts's upsertEntity() — keyed
 * globally on {type, naturalKey} with no client column in the `where`
 * clause — merges these across completely unrelated CRM clients: e.g.
 * two different leads who happen to share a first+last name (or, as
 * observed, a lead whose name collides with an unrelated public
 * figure's real profile) would silently share the same `person`
 * row, and a social_profile entity weakly matched during one client's
 * investigation would keep whatever confidence/evidence a totally
 * different client's investigation last wrote to that same row —
 * `crmClientId` on that shared row even gets overwritten, so the
 * entity's apparent "owner" could flip between clients. company/
 * domain/website/news_item are deliberately left global — those
 * represent facts about the world (a company, a domain, an article)
 * that are legitimately meant to be shared/enriched across whichever
 * leads happen to relate to them.
 *
 * `crmClientId` is only reliably set on `entity.crmClientId` right
 * before persistToStore() (see KnowledgeGraph.setCrmClientId) — calls
 * made earlier, during a single run's in-memory graph building, pass
 * no clientId, which is fine since one run only ever concerns one
 * client and the in-memory dedup doesn't need scoping.
 */
export function computeNaturalKey(
  type: EntityType,
  properties: EntityProperties,
  crmClientId?: string | null,
): string {
  const scope = crmClientId ? `${crmClientId}:` : "";

  switch (type) {
    case "person": {
      const p = properties as PersonProperties;
      const name = (p.normalizedFullName || `${p.firstName} ${p.lastName}`)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
      return `person:${scope}${name}`;
    }

    case "company": {
      const c = properties as CompanyProperties;
      const name = (c.normalizedName || normalizeCompanyName(c.name))
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
      return `company:${name}`;
    }

    case "position": {
      const pos = properties as PositionProperties;
      return `position:${scope}${pos.title.toLowerCase().trim()}`;
    }

    case "phone": {
      const ph = properties as PhoneProperties;
      return `phone:${scope}${ph.digits || digitsOnly(ph.raw)}`;
    }

    case "email": {
      const e = properties as EmailProperties;
      return `email:${scope}${e.address.toLowerCase().trim()}`;
    }

    case "domain": {
      const d = properties as DomainProperties;
      return `domain:${d.domain.toLowerCase().trim()}`;
    }

    case "website": {
      const w = properties as WebsiteProperties;
      return `website:${canonicalizeUrl(w.url)}`;
    }

    case "social_profile": {
      const s = properties as SocialProfileProperties;
      return `social_profile:${scope}${s.platform}:${s.username.toLowerCase().trim()}`;
    }

    case "address": {
      const a = properties as AddressProperties;
      return `address:${scope}${normalizeText(a.raw).toLowerCase().replace(/\s+/g, " ")}`;
    }

    case "news_item": {
      const n = properties as NewsItemProperties;
      return `news_item:${canonicalizeUrl(n.url)}`;
    }

    default:
      return `${type}:unknown`;
  }
}

// ─────────────────────────────────────────────────────────────
// 2. Property Merge
// ─────────────────────────────────────────────────────────────

/**
 * Merge two sets of entity properties.  Existing (verified) values
 * are kept unless they are empty/undefined.  Incoming values fill
 * gaps.  Array fields are unioned.
 */
export function mergeProperties(
  existing: EntityProperties,
  incoming: EntityProperties,
  type: EntityType,
): EntityProperties {
  switch (type) {
    case "person":
      return mergePerson(existing as PersonProperties, incoming as PersonProperties);
    case "company":
      return mergeCompany(existing as CompanyProperties, incoming as CompanyProperties);
    case "position":
      return mergePosition(existing as PositionProperties, incoming as PositionProperties);
    case "phone":
      return mergePhone(existing as PhoneProperties, incoming as PhoneProperties);
    case "email":
      return mergeEmail(existing as EmailProperties, incoming as EmailProperties);
    case "domain":
      return mergeDomain(existing as DomainProperties, incoming as DomainProperties);
    case "website":
      return mergeWebsite(existing as WebsiteProperties, incoming as WebsiteProperties);
    case "social_profile":
      return mergeSocialProfile(existing as SocialProfileProperties, incoming as SocialProfileProperties);
    case "address":
      return mergeAddress(existing as AddressProperties, incoming as AddressProperties);
    case "news_item":
      return mergeNewsItem(existing as NewsItemProperties, incoming as NewsItemProperties);
    default:
      return incoming;
  }
}

/** Pick existing value if truthy, otherwise incoming. */
function pick<T>(existing: T | undefined, incoming: T | undefined): T | undefined {
  if (existing !== undefined && existing !== null && existing !== "") return existing;
  return incoming;
}

/** Pick existing value or fallback to a default. */
function pickOr<T>(existing: T | undefined, incoming: T | undefined, fallback: T): T {
  return (pick(existing, incoming) as T) ?? fallback;
}

function mergePerson(a: PersonProperties, b: PersonProperties): PersonProperties {
  return {
    firstName: pickOr(a.firstName, b.firstName, ""),
    lastName: pickOr(a.lastName, b.lastName, ""),
    fullName: pickOr(a.fullName, b.fullName, ""),
    normalizedFullName: pickOr(a.normalizedFullName, b.normalizedFullName, ""),
    emailDomain: pick(a.emailDomain, b.emailDomain),
    locality: pick(a.locality, b.locality),
    profession: pick(a.profession, b.profession),
  };
}

function mergeCompany(a: CompanyProperties, b: CompanyProperties): CompanyProperties {
  return {
    name: pickOr(a.name, b.name, ""),
    normalizedName: pickOr(a.normalizedName, b.normalizedName, ""),
    industry: pick(a.industry, b.industry),
    size: pick(a.size, b.size),
    employeeCount: pick(a.employeeCount, b.employeeCount),
    foundedYear: pick(a.foundedYear, b.foundedYear),
    description: pick(a.description, b.description),
  };
}

function mergePosition(a: PositionProperties, b: PositionProperties): PositionProperties {
  return {
    title: pickOr(a.title, b.title, ""),
    seniority: pick(a.seniority, b.seniority),
    startDate: pick(a.startDate, b.startDate),
    endDate: pick(a.endDate, b.endDate),
    isCurrent: a.isCurrent ?? b.isCurrent ?? true,
  };
}

function mergePhone(a: PhoneProperties, b: PhoneProperties): PhoneProperties {
  const variants = Array.from(new Set([...(a.variants || []), ...(b.variants || [])]));
  return {
    raw: pickOr(a.raw, b.raw, ""),
    digits: pickOr(a.digits, b.digits, ""),
    country: pickOr(a.country, b.country, ""),
    variants,
    type: pick(a.type, b.type),
  };
}

function mergeEmail(a: EmailProperties, b: EmailProperties): EmailProperties {
  return {
    address: pickOr(a.address, b.address, ""),
    domain: pickOr(a.domain, b.domain, ""),
    isCorporate: a.isCorporate || b.isCorporate,
    isDisposable: a.isDisposable || b.isDisposable,
    isVerified: a.isVerified || b.isVerified,
  };
}

function mergeDomain(a: DomainProperties, b: DomainProperties): DomainProperties {
  return {
    domain: pickOr(a.domain, b.domain, ""),
    registrant: pick(a.registrant, b.registrant),
    registeredAt: pick(a.registeredAt, b.registeredAt),
  };
}

function mergeWebsite(a: WebsiteProperties, b: WebsiteProperties): WebsiteProperties {
  const tech = Array.from(new Set([...(a.technologies || []), ...(b.technologies || [])]));
  return {
    url: pickOr(a.url, b.url, ""),
    title: pick(a.title, b.title),
    description: pick(a.description, b.description),
    technologies: tech.length > 0 ? tech : undefined,
    hasContactPage: a.hasContactPage || b.hasContactPage,
    sslValid: a.sslValid || b.sslValid,
  };
}

function mergeSocialProfile(a: SocialProfileProperties, b: SocialProfileProperties): SocialProfileProperties {
  return {
    platform: a.platform || b.platform || "other",
    url: pickOr(a.url, b.url, ""),
    username: pickOr(a.username, b.username, ""),
    displayName: pick(a.displayName, b.displayName),
    bio: pick(a.bio, b.bio),
    followers: pick(a.followers, b.followers),
    following: pick(a.following, b.following),
    posts: pick(a.posts, b.posts),
    lastActivityAt: pick(a.lastActivityAt, b.lastActivityAt),
  };
}

function mergeAddress(a: AddressProperties, b: AddressProperties): AddressProperties {
  return {
    raw: pickOr(a.raw, b.raw, ""),
    street: pick(a.street, b.street),
    city: pick(a.city, b.city),
    state: pick(a.state, b.state),
    country: pick(a.country, b.country),
    postalCode: pick(a.postalCode, b.postalCode),
    geoLat: pick(a.geoLat, b.geoLat),
    geoLng: pick(a.geoLng, b.geoLng),
  };
}

function mergeNewsItem(a: NewsItemProperties, b: NewsItemProperties): NewsItemProperties {
  return {
    title: pickOr(a.title, b.title, ""),
    url: pickOr(a.url, b.url, ""),
    source: pickOr(a.source, b.source, ""),
    publishedAt: pick(a.publishedAt, b.publishedAt),
    snippet: pick(a.snippet, b.snippet),
    category: a.category || b.category || "other",
    language: pickOr(a.language, b.language, "es"),
  };
}

// ─────────────────────────────────────────────────────────────
// 3. Evidence Merge
// ─────────────────────────────────────────────────────────────

/**
 * Merge two arrays of evidence refs, deduplicating by evidenceId.
 */
export function mergeEvidenceRefs(
  existing: EvidenceRef[],
  incoming: EvidenceRef[],
): EvidenceRef[] {
  const map = new Map<string, EvidenceRef>();
  for (const ref of [...existing, ...incoming]) {
    if (ref.evidenceId && !map.has(ref.evidenceId)) {
      map.set(ref.evidenceId, ref);
    }
  }
  return Array.from(map.values());
}

// ─────────────────────────────────────────────────────────────
// 4. Entity Merge (full GraphEntity)
// ─────────────────────────────────────────────────────────────

/**
 * Merge an incoming entity into an existing one.  The existing entity
 * is the "anchor" — its id is preserved.  Properties are merged
 * (existing takes priority), evidence is unioned, confidence is the
 * maximum of the two.
 */
export function mergeEntity(
  existing: GraphEntity,
  incoming: GraphEntity,
): GraphEntity {
  return {
    ...existing,
    properties: mergeProperties(existing.properties, incoming.properties, existing.type),
    confidence: Math.max(existing.confidence, incoming.confidence),
    confidenceFactors: mergeConfidenceFactors(
      existing.confidenceFactors,
      incoming.confidenceFactors,
    ),
    evidence: mergeEvidenceRefs(existing.evidence, incoming.evidence),
    lastVerifiedAt: new Date().toISOString(),
    lastUpdatedByRunId: incoming.lastUpdatedByRunId || existing.lastUpdatedByRunId,
    crmClientId: existing.crmClientId || incoming.crmClientId,
  };
}

/**
 * Merge confidence factor arrays by taking the max of each dimension.
 */
export function mergeConfidenceFactors(
  a: ConfidenceFactors,
  b: ConfidenceFactors,
): ConfidenceFactors {
  return {
    sourceReliability: Math.max(a.sourceReliability, b.sourceReliability),
    corroboration: Math.max(a.corroboration, b.corroboration),
    specificity: Math.max(a.specificity, b.specificity),
    recency: Math.max(a.recency, b.recency),
    consistency: Math.max(a.consistency, b.consistency),
  };
}

// ─────────────────────────────────────────────────────────────
// 5. Relation Merge
// ─────────────────────────────────────────────────────────────

/**
 * Merge two relations that have the same (type, sourceId, targetId).
 */
export function mergeRelation(
  existing: GraphRelation,
  incoming: GraphRelation,
): GraphRelation {
  return {
    ...existing,
    properties: { ...existing.properties, ...incoming.properties },
    confidence: Math.max(existing.confidence, incoming.confidence),
    confidenceFactors: mergeConfidenceFactors(
      existing.confidenceFactors,
      incoming.confidenceFactors,
    ),
    evidence: mergeEvidenceRefs(existing.evidence, incoming.evidence),
    lastVerifiedAt: new Date().toISOString(),
    lastUpdatedByRunId: incoming.lastUpdatedByRunId || existing.lastUpdatedByRunId,
  };
}
