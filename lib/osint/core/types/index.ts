// ============================================================
// OSINT Intelligence Platform — Core Type Definitions
// ============================================================
// This file is the single source of truth for all types used
// across the OSINT module. Split into logical sections.
// ============================================================

// ─────────────────────────────────────────────────────────────
// SECTION 1: Knowledge Graph — Entity Types
// ─────────────────────────────────────────────────────────────

export type EntityType =
  | 'person'
  | 'company'
  | 'position'
  | 'phone'
  | 'email'
  | 'domain'
  | 'website'
  | 'social_profile'
  | 'address'
  | 'news_item';

export type SocialPlatform =
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'youtube'
  | 'github'
  | 'tiktok'
  | 'reddit'
  | 'other';

export type NewsCategory =
  | 'expansion'
  | 'investment'
  | 'award'
  | 'hiring'
  | 'event'
  | 'interview'
  | 'public_tender'
  | 'public_mention'
  | 'other';

export interface GraphEntity {
  id: string;
  type: EntityType;
  properties: EntityProperties;
  confidence: number;
  confidenceFactors: ConfidenceFactors;
  evidence: EvidenceRef[];
  firstSeenAt: string;
  lastVerifiedAt: string;
  lastUpdatedByRunId: string;
  supersededBy?: string;
  crmClientId?: string;
}

export type EntityProperties =
  | PersonProperties
  | CompanyProperties
  | PositionProperties
  | PhoneProperties
  | EmailProperties
  | DomainProperties
  | WebsiteProperties
  | SocialProfileProperties
  | AddressProperties
  | NewsItemProperties;

export interface PersonProperties {
  firstName: string;
  lastName: string;
  fullName: string;
  normalizedFullName: string;
  emailDomain?: string;
  locality?: string;
  profession?: string;
}

export interface CompanyProperties {
  name: string;
  normalizedName: string;
  industry?: string;
  size?: string;
  employeeCount?: string;
  foundedYear?: string;
  description?: string;
}

export interface PositionProperties {
  title: string;
  seniority?: string;
  startDate?: string;
  endDate?: string;
  isCurrent: boolean;
}

export interface PhoneProperties {
  raw: string;
  digits: string;
  country: string;
  variants: string[];
  type?: 'mobile' | 'landline' | 'unknown';
}

export interface EmailProperties {
  address: string;
  domain: string;
  isCorporate: boolean;
  isDisposable: boolean;
  isVerified: boolean;
}

export interface DomainProperties {
  domain: string;
  registrant?: string;
  registeredAt?: string;
}

export interface WebsiteProperties {
  url: string;
  title?: string;
  description?: string;
  technologies?: string[];
  hasContactPage: boolean;
  sslValid: boolean;
}

export interface SocialProfileProperties {
  platform: SocialPlatform;
  url: string;
  username: string;
  displayName?: string;
  bio?: string;
  followers?: number;
  following?: number;
  posts?: number;
  lastActivityAt?: string;
  verified?: boolean;
  /** Instagram: isBusinessAccount. Facebook: always true (pages are inherently business profiles). */
  isBusinessAccount?: boolean;
  /** Instagram: businessCategoryName. Facebook: categories.join(", "). */
  businessCategory?: string;
  /** Link in bio (Instagram externalUrl) or page website (Facebook). Often the lead's own site/portfolio — worth feeding back into WebsiteAgent. */
  externalUrl?: string;
  /** Contact channel the platform itself exposes on the profile — not scraped from bio text, so relatively high-confidence when present. */
  publicEmail?: string;
  publicPhoneNumber?: string;
  city?: string;
}

export interface AddressProperties {
  raw: string;
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  geoLat?: number;
  geoLng?: number;
}

export interface NewsItemProperties {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
  snippet?: string;
  category: NewsCategory;
  language: string;
}

// ─────────────────────────────────────────────────────────────
// SECTION 2: Knowledge Graph — Relation Types
// ─────────────────────────────────────────────────────────────

export type RelationType =
  | 'WORKS_AT'
  | 'HAS_POSITION'
  | 'AT_COMPANY'
  | 'HAS_PHONE'
  | 'HAS_EMAIL'
  | 'OWNS_DOMAIN'
  | 'RESOLVES_TO'
  | 'HAS_WEBSITE'
  | 'HAS_SOCIAL'
  | 'LOCATED_AT'
  | 'MENTIONED_IN'
  | 'COMPETITOR_OF'
  | 'SUBSIDIARY_OF'
  | 'AFFILIATED_WITH'
  | 'FOUND_AT';

export interface GraphRelation {
  id: string;
  type: RelationType;
  sourceId: string;
  targetId: string;
  properties?: Record<string, unknown>;
  confidence: number;
  confidenceFactors: ConfidenceFactors;
  evidence: EvidenceRef[];
  firstSeenAt: string;
  lastVerifiedAt: string;
  lastUpdatedByRunId: string;
}

// ─────────────────────────────────────────────────────────────
// SECTION 3: Evidence & Audit
// ─────────────────────────────────────────────────────────────

export type SourceType =
  | 'search_engine'
  | 'social_platform'
  | 'corporate_site'
  | 'directory'
  | 'news'
  | 'classified';

export type SignalType =
  | 'exact_email'
  | 'exact_phone'
  | 'full_name_company'
  | 'full_name_location'
  | 'full_name_only'
  | 'surname_rare'
  | 'surname_common'
  | 'first_name_only';

export interface EvidenceRecord {
  id: string;
  runId: string;
  entityId?: string;
  sourceDomain: string;
  sourceUrl: string;
  sourceType: SourceType;
  provider: string;
  title: string;
  snippet: string;
  rawContent?: string;
  matchReasons: string[];
  extractedAt: string;
}

export interface EvidenceRef {
  evidenceId: string;
  sourceDomain: string;
  provider: string;
  matchType: SignalType;
}

// ─────────────────────────────────────────────────────────────
// SECTION 4: Confidence Engine
// ─────────────────────────────────────────────────────────────

export interface ConfidenceFactors {
  sourceReliability: number;
  corroboration: number;
  specificity: number;
  recency: number;
  consistency: number;
}

export interface ConfidenceWeights {
  sourceReliability: number;
  corroboration: number;
  specificity: number;
  recency: number;
  consistency: number;
}

export type EntityField =
  | 'person.linkedin'
  | 'person.twitter'
  | 'person.instagram'
  | 'person.facebook'
  | 'person.github'
  | 'person.profession'
  | 'person.company'
  | 'person.position'
  | 'person.phone'
  | 'person.email'
  | 'person.location'
  | 'company.website'
  | 'company.industry'
  | 'company.size'
  | 'company.news'
  | 'company.competitors';

// ─────────────────────────────────────────────────────────────
// SECTION 5: Agents
// ─────────────────────────────────────────────────────────────

export interface AgentInput {
  targetId: string;
  hints: Record<string, unknown>;
}

export interface AgentOutput {
  entities: GraphEntity[];
  relations: GraphRelation[];
  evidence: EvidenceRecord[];
  suggestions: PlannerSuggestion[];
  metrics: AgentMetrics;
}

export interface AgentMetrics {
  agentId: string;
  durationMs: number;
  queriesExecuted: number;
  cacheHits: number;
  providersUsed: string[];
  providersFailed: string[];
  tokensUsed: number;
  resultsFound: number;
}

export interface PlannerSuggestion {
  type: 'search' | 'fetch_page' | 'investigate_entity' | 'run_agent';
  priority: 'high' | 'medium' | 'low';
  rationale: string;
  params: Record<string, unknown>;
  expectedField?: EntityField;
}

// ─────────────────────────────────────────────────────────────
// SECTION 6: Providers
// ─────────────────────────────────────────────────────────────

export type ProviderCategory =
  | 'search_engine'
  | 'social_platform'
  | 'business_directory'
  | 'news_aggregator'
  | 'page_fetcher'
  | 'ai_provider'
  | 'identity_provider'
  | 'real_time_data'
  | 'structured_data';

export type ProviderCapability =
  | 'web_search'
  | 'site_search'
  | 'profile_lookup'
  | 'company_lookup'
  | 'news_search'
  | 'page_fetch'
  | 'structured_data'
  | 'real_time'
  | 'identity_verification'
  | 'contact_enrichment'
  | 'social_enrichment'
  | 'email_validation'
  | 'phone_validation'
  | 'address_validation';

export interface ProviderQuery {
  text: string;
  options?: {
    siteRestrict?: string;
    dateRange?: { from: string; to: string };
    language?: string;
    region?: string;
    maxResults?: number;
  };
}

export interface ProviderResult {
  url: string;
  title: string;
  snippet: string;
  rawContent?: string;
  structuredData?: Record<string, unknown>;
  publishedAt?: string;
  fetchedAt: string;
}

// ─────────────────────────────────────────────────────────────
// SECTION 7: Memory
// ─────────────────────────────────────────────────────────────

export interface MemoryRecall {
  entity: GraphEntity;
  age: number;
  isFresh: boolean;
  requiresRefresh: boolean;
  relatedEntities: GraphEntity[];
}

export interface CachedSearch {
  cacheKey: string;
  provider: string;
  query: string;
  results: ProviderResult[];
  createdAt: string;
  expiresAt: string;
}

// ─────────────────────────────────────────────────────────────
// SECTION 8: Observability
// ─────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogMeta {
  traceId?: string;
  runId?: string;
  agentId?: string;
  providerId?: string;
  entityId?: string;
  stage?: string;
  durationMs?: number;
  [key: string]: unknown;
}

export interface PlannerDecision {
  runId: string;
  cycle: number;
  knowledgeState: string;
  candidateActions: Array<{ action: string; eig: number }>;
  selectedAction: string;
  rationale: string;
  timestamp: string;
}

export interface RunMetrics {
  pipeline: {
    totalDurationMs: number;
    stageTimings: Record<string, number>;
    cyclesExecuted: number;
  };
  providers: Record<string, {
    requestsSent: number;
    successes: number;
    failures: number;
    rateLimited: number;
    cacheHits: number;
    avgLatencyMs: number;
    usefulResults: number;
    usefulnessRate: number;
    costUsd: number;
  }>;
  quality: {
    identityVerified: boolean;
    avgConfidence: number;
    fieldCoverage: number;
    conflictsDetected: number;
  };
  cost: {
    totalUsd: number;
    aiTokensUsed: number;
    queriesFromCache: number;
    cacheSavingsUsd: number;
  };
}

// ─────────────────────────────────────────────────────────────
// SECTION 9: Configuration
// ─────────────────────────────────────────────────────────────

export interface OsintConfig {
  maxCycles: number;
  maxQueries: number;
  maxDurationMs: number;
  maxCostUsd: number;
  confidenceThresholds: {
    autoUpdateCrm: number;
    pendingVerification: number;
    evidenceOnly: number;
  };
  confidenceWeights: ConfidenceWeights;
  providers: Record<string, ProviderRuntimeConfig>;
  enableCircuitBreaker: boolean;
  enableCache: boolean;
  cacheTtlDays: number;
  aiModel: string;
  aiMaxTokens: number;
  aiEnabled: boolean;
  entityTtl: Partial<Record<EntityType, number>>;
  enableMemoryReuse: boolean;
}

export interface ProviderRuntimeConfig {
  enabled: boolean;
  maxConcurrent: number;
  requestsPerSecond: number;
  timeoutMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  circuitThreshold: number;
  circuitCooldownMs: number;
  apiKey?: string;
  costPerRequestUsd?: number;
  reliabilityScore?: number;
  priority?: number;
  tags?: string[];
}

// ─────────────────────────────────────────────────────────────
// SECTION 11: Provider Scoring & Selection
// ─────────────────────────────────────────────────────────────

export interface ProviderScore {
  providerId: string;
  totalScore: number;
  factors: {
    reliability: number;
    cost: number;
    latency: number;
    successRate: number;
    priority: number;
  };
  reasoning: string;
}

export interface ProviderSelectionContext {
  capability: ProviderCapability;
  budget?: number;
  maxLatency?: number;
  minReliability?: number;
  excludeProviders?: string[];
  preferredProviders?: string[];
}

export interface ProviderExecutionResult {
  providerId: string;
  success: boolean;
  durationMs: number;
  results: ProviderResult[];
  error?: string;
  cost?: number;
}

export interface ProviderAuditLog {
  timestamp: string;
  capability: ProviderCapability;
  selectedProviders: string[];
  fallbackChain: string[];
  executionResults: ProviderExecutionResult[];
  finalChoice: string;
  reasoning: string;
}

// ─────────────────────────────────────────────────────────────
// SECTION 10: Orchestrator (Public API)
// ─────────────────────────────────────────────────────────────

export interface InvestigationRequest {
  clientId: string;
  trigger: 'manual' | 'scheduled' | 'webhook';
  triggeredBy: string;
  options?: Partial<OsintConfig>;
  /** Pre-existing OsintRun id (e.g. created by the API route for SSE subscription) to reuse instead of minting a new one. */
  runId?: string;
}

export interface InvestigationResult {
  runId: string;
  status: 'completed' | 'partial' | 'failed' | 'timeout';
  durationMs: number;
  cyclesExecuted: number;
  personProfile: PersonProfileView;
  companyProfile: CompanyProfileView | null;
  overallConfidence: number;
  identityVerified: boolean;
  aiInsights: AIInsights | null;
  metrics: RunMetrics;
  auditTrail: PlannerDecision[];
}

export interface PersonProfileView {
  person: GraphEntity;
  socialProfiles: GraphEntity[];
  phone: GraphEntity | null;
  email: GraphEntity | null;
  position: GraphEntity | null;
  company: GraphEntity | null;
  address: GraphEntity | null;
  newsItems: GraphEntity[];
}

export interface CompanyProfileView {
  company: GraphEntity;
  domain: GraphEntity | null;
  website: GraphEntity | null;
  socialProfiles: GraphEntity[];
  address: GraphEntity | null;
  newsItems: GraphEntity[];
  competitors: GraphEntity[];
}

export interface AIInsights {
  summary: string;
  interests: string[];
  salesOpportunities: string[];
  salesStrategy: string;
  purchasingPower: string;
  professionalProfile: string;
  alerts: string[];
  overallConfidence: number;
}
