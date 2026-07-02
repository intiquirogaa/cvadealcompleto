// ============================================================
// OSINT Enrichment Pipeline — Shared Types
// ============================================================

/** A single enriched datum with its source and confidence score */
export interface EnrichedDatum<T = string> {
  value: T;
  /** 0–100 */
  confidence: number;
  /** e.g. "linkedin.com", "google.com/search", "duckduckgo.com" */
  source: string;
  sourceUrl?: string;
  lastVerified: string; // ISO date string
}

/** A social media profile found during research */
export interface SocialProfile {
  platform:
    | "linkedin"
    | "instagram"
    | "facebook"
    | "twitter"
    | "youtube"
    | "github"
    | "tiktok"
    | "other";
  url: EnrichedDatum<string>;
  displayName?: string;
  bio?: string;
  lastActivity?: string;
  /** Signals that matched this profile to the target person */
  matchReasons: string[];
}

/** A news article or public mention */
export interface NewsItem {
  title: string;
  url: string;
  date?: string;
  source: string;
  snippet?: string;
  /** e.g. "expansión", "inversión", "premio", "evento", "contratación" */
  category: string;
  /** 0–100 */
  relevance: number;
}

/** Enriched company data */
export interface CompanyData {
  name: EnrichedDatum<string>;
  industry?: EnrichedDatum<string>;
  website?: EnrichedDatum<string>;
  size?: EnrichedDatum<string>;
  employeeCount?: EnrichedDatum<string>;
  location?: EnrichedDatum<string>;
  googleMapsUrl?: string;
  foundedYear?: EnrichedDatum<string>;
  socialProfiles: SocialProfile[];
  recentNews: NewsItem[];
}

/** Identity verification result from Stage 1 */
export interface IdentityResult {
  verified: boolean;
  /** 0–100 */
  confidence: number;
  /** Which signals matched (e.g. "Empresa coincidente", "Ciudad confirmada") */
  matchedSignals: string[];
  message: string;
}

/** AI analysis produced in Stage 6 */
export interface AIAnalysis {
  summary: string;
  interests: string[];
  salesOpportunities: string[];
  salesStrategy: string;
  estimatedPurchasingPower: EnrichedDatum<
    "Muy Alto" | "Alto" | "Medio" | "Bajo" | "Desconocido"
  >;
  professionalProfile: string;
  alerts: string[];
  /** 0–100 */
  overallConfidence: number;
}

/** Source entry used in the final result */
export interface SourceEntry {
  name: string;
  url: string;
  /** 0–100 */
  reliability: number;
}

/** A raw search result from DuckDuckGo */
export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  /** 0–100, calculated based on how many client signals it matches */
  relevanceScore: number;
}

export interface PhoneAssociation {
  title: string;
  url: string;
  source: string;
  snippet?: string;
  category:
    | "perfil social"
    | "directorio"
    | "clasificado"
    | "comercial"
    | "mención pública";
  matchedPhone: string;
  matchReasons: string[];
  /** 0–100 */
  confidence: number;
}

export interface ProfileDetails {
  detectedRole?: EnrichedDatum<string>;
  detectedCompany?: EnrichedDatum<string>;
  currentLocation?: EnrichedDatum<string>;
  education: EnrichedDatum<string>[];
  experience: EnrichedDatum<string>[];
  phoneAssociations: PhoneAssociation[];
  socialMetrics: Array<{
    platform: SocialProfile["platform"];
    followers?: string;
    following?: string;
    posts?: string;
    sourceUrl: string;
  }>;
  publicMentions: NewsItem[];
}

/** Complete enrichment result returned by the pipeline */
export interface EnrichmentResult {
  // Metadata
  enrichmentId: string;
  timestamp: string;
  /** Total pipeline duration in milliseconds */
  pipelineDuration: number;
  /** 0–100 */
  overallConfidence: number;

  // Stage 1
  identity: IdentityResult;

  // Stages 2–3: Professional profile
  profession: EnrichedDatum<string> | null;
  title: EnrichedDatum<string> | null;
  socialProfiles: SocialProfile[];

  // Stage 4: Company
  company: CompanyData | null;

  // Stage 5: Profile details and public mentions
  profileDetails: ProfileDetails;
  news: NewsItem[];

  // Stage 6: AI
  aiAnalysis: AIAnalysis | null;

  // Meta
  sources: SourceEntry[];
  insights: string[];
}

/** Input data available about the client (subset of CRMClient) */
export interface ClientInput {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  locality?: string;
  profession?: string;
  company?: string;
}
