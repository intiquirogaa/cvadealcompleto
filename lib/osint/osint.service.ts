// ============================================================
// OSINT Platform — Integration Service
// ============================================================
// Orchestration service that bootstraps the new OSINT system and
// provides backward compatibility with the legacy EnrichmentResult format.
// This is the main entry point that replaces ProfileEnrichmentService.
// ============================================================

import { PlannerAgent } from "./core/agents/planner-agent";
import { AgentRegistry, agentRegistry, AGENT_IDS } from "./core/agents/agent.registry";
import { ProviderRegistry, providerRegistry } from "./core/providers/provider.registry";
import { providerFactory } from "./core/providers/provider.factory";
import { GraphStore, graphStore } from "./core/persistence/graph-store";
import { ConfidenceEngine } from "./core/confidence/confidence-engine";
import { MemoryStore, memoryStore } from "./core/memory/memory-store";
import { ProviderReliabilityTracker, providerReliabilityTracker } from "./core/confidence/provider-reliability";
import { 
  DEFAULT_OSINT_CONFIG, 
  DEFAULT_CONFIDENCE_WEIGHTS,
  DEFAULT_ENTITY_TTL 
} from "./config/default.config";
import { logger, createRunLogger } from "./core/observability/logger";

// Import agents
import { SearchAgent } from "./core/agents/search-agent";
import { IdentityAgent } from "./core/agents/identity-agent";
import { CompanyAgent } from "./core/agents/company-agent";
import { SocialAgent } from "./core/agents/social-agent";
import { PhoneAgent } from "./core/agents/phone-agent";
import { EmailAgent } from "./core/agents/email-agent";
import { NewsAgent } from "./core/agents/news-agent";
import { WebsiteAgent } from "./core/agents/website-agent";
import { aiReasoner } from "./core/agents/ai-reasoner";
import { ruleBasedReasoner } from "./core/agents/rule-based-reasoner";
import { buildNewsConclusions } from "./core/infrastructure/news-conclusions";
import { extractNotesSignals } from "./core/infrastructure/notes-signals";

// Legacy types for compatibility
import type { ClientInput, EnrichmentResult } from "@/lib/enrichment/types";
import type { 
  InvestigationRequest, 
  InvestigationResult, 
  PersonProfileView,
  CompanyProfileView 
} from "./core/types";

export class OsintService {
  private planner: PlannerAgent;
  private confidenceEngine: ConfidenceEngine;
  private initialized = false;

  constructor() {
    // Initialize system asynchronously
    this.initializeSystem();
    
    this.confidenceEngine = new ConfidenceEngine({
      reliabilityTracker: providerReliabilityTracker,
      weights: DEFAULT_CONFIDENCE_WEIGHTS,
      entityTtl: DEFAULT_ENTITY_TTL,
    });

    this.planner = new PlannerAgent(
      agentRegistry,
      graphStore,
      providerRegistry,
      this.confidenceEngine,
      memoryStore,
      DEFAULT_OSINT_CONFIG
    );
  }

  /**
   * Bootstrap the OSINT system: register all agents and providers
   */
  private async initializeSystem(): Promise<void> {
    if (this.initialized) return;

    logger.info("Initializing OSINT system with production provider ecosystem");

    // Initialize the complete provider ecosystem
    await providerFactory.initializeProviders();
    
    // Register agents
    this.registerAgents();

    this.initialized = true;
    
    // Log ecosystem summary
    const providerStats = providerRegistry.getAllStats();
    const enabledProviders = providerStats.filter(p => p.enabled);
    const capabilities = providerFactory.getAvailableCapabilities();
    
    logger.info("OSINT production ecosystem initialized", {
      totalProviders: providerStats.length,
      enabledProviders: enabledProviders.length,
      agents: agentRegistry.getRegisteredIds(),
      capabilities,
      scoringEngine: "enabled"
    });
  }

  private registerAgents(): void {
    // Register all agents with the registry
    agentRegistry.register(new SearchAgent());
    agentRegistry.register(new IdentityAgent());
    agentRegistry.register(new CompanyAgent());
    agentRegistry.register(new SocialAgent());
    agentRegistry.register(new PhoneAgent());
    agentRegistry.register(new EmailAgent());
    agentRegistry.register(new NewsAgent());
    agentRegistry.register(new WebsiteAgent());

    logger.debug("Agents registered", {
      agents: agentRegistry.getRegisteredIds()
    });
  }

  /**
   * Main enrichment method - replaces ProfileEnrichmentService.enrich()
   * Maintains backward compatibility with the legacy EnrichmentResult format
   */
  async enrich(client: ClientInput, runId?: string): Promise<EnrichmentResult> {
    const startTime = Date.now();
    const runLogger = logger.child({ clientId: client.id });

    runLogger.info("OSINT enrichment starting", {
      clientName: `${client.firstName} ${client.lastName}`,
      clientId: client.id
    });

    try {
      // Convert ClientInput to InvestigationRequest
      const request: InvestigationRequest = {
        clientId: client.id,
        trigger: "manual",
        triggeredBy: "crm_user",
        runId,
      };

      // Free-text CRM notes often carry disambiguating context a plain
      // name search can't find on its own (e.g. "se muda a Mendoza") —
      // extract that as a separate hint rather than overloading `locality`,
      // since search-agent.ts needs to treat it as an *additional* query,
      // not a replacement for the declared locality.
      const notesSignals = extractNotesSignals(client.notes);

      // Prepare initial hints from client data
      const initialHints = {
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.phone,
        locality: client.locality,
        profession: client.profession,
        company: client.company,
        notesLocality: notesSignals.mentionedLocality ?? undefined,
      };

      // Run the investigation using the new OSINT planner
      const investigationResult = await this.planner.investigate(request, initialHints);

      // 8. AI Reasoner: Generate insights from the final knowledge graph.
      // Falls back to rule-based heuristics when OPENAI_API_KEY isn't set —
      // previously this step was just skipped, leaving purchasingPower/
      // professionalProfile empty for every lead without a paid key.
      if (investigationResult.personProfile) {
        const aiInsights = await aiReasoner.generateInsights(
          investigationResult.personProfile,
          investigationResult.companyProfile,
          investigationResult.overallConfidence
        );
        investigationResult.aiInsights = aiInsights ?? ruleBasedReasoner.generateInsights(
          investigationResult.personProfile,
          investigationResult.companyProfile,
          investigationResult.overallConfidence
        );

        if (notesSignals.observations.length > 0 && investigationResult.aiInsights) {
          investigationResult.aiInsights.alerts = [
            ...investigationResult.aiInsights.alerts,
            ...notesSignals.observations,
          ];
        }
      }

      // Convert InvestigationResult to legacy EnrichmentResult format
      const legacyResult = this.convertToLegacyFormat(investigationResult, client, startTime);

      runLogger.info("OSINT enrichment completed", {
        status: investigationResult.status,
        durationMs: investigationResult.durationMs,
        overallConfidence: legacyResult.overallConfidence,
        identityVerified: legacyResult.identity.verified
      });

      return legacyResult;

    } catch (error) {
      runLogger.error("OSINT enrichment failed", { error: String(error) });
      
      // Return a minimal failed result in legacy format
      return this.createFailedLegacyResult(client, startTime, String(error));
    }
  }

  /**
   * Convert new InvestigationResult to legacy EnrichmentResult format
   * for backward compatibility with existing CRM frontend
   */
  private convertToLegacyFormat(
    result: InvestigationResult, 
    client: ClientInput,
    startTime: number
  ): EnrichmentResult {
    const pipelineDuration = Date.now() - startTime;
    
    // Extract person and company profiles
    const personProfile = result.personProfile;
    const companyProfile = result.companyProfile;

    // Build legacy format step by step
    const legacyResult: EnrichmentResult = {
      enrichmentId: result.runId,
      timestamp: new Date().toISOString(),
      pipelineDuration,
      overallConfidence: Math.round(result.overallConfidence),
      
      // Identity verification
      identity: {
        verified: result.identityVerified,
        confidence: Math.round(result.overallConfidence),
        matchedSignals: this.extractIdentitySignals(personProfile),
        message: result.identityVerified 
          ? `Identidad verificada con ${Math.round(result.overallConfidence)}% de confianza`
          : `Identidad no verificada. Confianza: ${Math.round(result.overallConfidence)}%`
      },

      // Professional info
      profession: personProfile?.person ? this.extractProfession(personProfile) : null,
      title: personProfile?.position ? this.extractTitle(personProfile) : null,
      
      // Social profiles
      socialProfiles: this.convertSocialProfiles(personProfile?.socialProfiles || []),
      
      // Company data
      company: companyProfile ? this.convertCompanyData(companyProfile) : null,
      
      // Profile details
      profileDetails: this.buildProfileDetails(personProfile, companyProfile),
      
      // News items
      news: this.convertNewsItems(personProfile?.newsItems || []),
      
      // AI analysis
      aiAnalysis: result.aiInsights,
      
      // Sources
      sources: this.buildSourcesList(result),
      
      // Insights
      insights: this.buildInsights(result, personProfile, companyProfile)
    };

    return legacyResult;
  }

  private extractIdentitySignals(personProfile: PersonProfileView | null): string[] {
    if (!personProfile) return [];
    
    const signals: string[] = [];
    if (personProfile.email) signals.push("Email confirmado");
    if (personProfile.phone) signals.push("Teléfono confirmado");
    if (personProfile.company) signals.push("Empresa confirmada");
    if (personProfile.socialProfiles.length > 0) signals.push("Perfiles sociales encontrados");
    
    return signals;
  }

  private extractProfession(personProfile: PersonProfileView): any {
    const person = personProfile.person;
    const profession = (person.properties as any).profession;
    
    if (!profession) return null;
    
    return {
      value: profession,
      confidence: Math.round(person.confidence),
      source: "osint_platform",
      lastVerified: person.lastVerifiedAt
    };
  }

  private extractTitle(personProfile: PersonProfileView): any {
    if (!personProfile.position) return null;
    
    const position = personProfile.position;
    const title = (position.properties as any).title;
    
    return {
      value: title,
      confidence: Math.round(position.confidence),
      source: "osint_platform", 
      lastVerified: position.lastVerifiedAt
    };
  }

  private convertSocialProfiles(socialEntities: any[]): any[] {
    // Keep only the highest-confidence entity per platform. Without this,
    // every candidate SocialAgent/WebsiteAgent ever found for a platform
    // (including near-zero-confidence name collisions — a search for
    // "site:instagram.com <name>" can surface a completely unrelated
    // account whose bio just happens to mention the name) ends up in the
    // same array, and downstream consumers that key by platform (the CRM's
    // socialLinks summary in osint.worker.ts) just take whichever one came
    // last — not the best match. Deduping here means every consumer of the
    // legacy EnrichmentResult benefits, not just one call site.
    const bestByPlatform = new Map<string, any>();
    for (const entity of socialEntities) {
      const platform = entity.properties.platform;
      const current = bestByPlatform.get(platform);
      if (!current || entity.confidence > current.confidence) {
        bestByPlatform.set(platform, entity);
      }
    }

    return Array.from(bestByPlatform.values()).map(entity => {
      const props = entity.properties;
      return {
        platform: props.platform,
        url: {
          value: props.url,
          confidence: Math.round(entity.confidence),
          source: "osint_platform",
          lastVerified: entity.lastVerifiedAt
        },
        displayName: props.displayName || "",
        bio: props.bio || "",
        matchReasons: ["osint_platform_match"]
      };
    });
  }

  private convertCompanyData(companyProfile: CompanyProfileView): any {
    const company = companyProfile.company;
    const props = company.properties as any;
    
    return {
      name: {
        value: props.name,
        confidence: Math.round(company.confidence),
        source: "osint_platform",
        lastVerified: company.lastVerifiedAt
      },
      industry: props.industry ? {
        value: props.industry,
        confidence: Math.round(company.confidence),
        source: "osint_platform",
        lastVerified: company.lastVerifiedAt
      } : undefined,
      website: companyProfile.website ? {
        value: (companyProfile.website.properties as any).url,
        confidence: Math.round(companyProfile.website.confidence),
        source: "osint_platform",
        lastVerified: companyProfile.website.lastVerifiedAt
      } : undefined,
      socialProfiles: this.convertSocialProfiles(companyProfile.socialProfiles),
      recentNews: this.convertNewsItems(companyProfile.newsItems)
    };
  }

  private buildProfileDetails(
    personProfile: PersonProfileView | null, 
    companyProfile: CompanyProfileView | null
  ): any {
    return {
      detectedRole: personProfile?.position ? {
        value: (personProfile.position.properties as any).title,
        confidence: Math.round(personProfile.position.confidence),
        source: "osint_platform",
        lastVerified: personProfile.position.lastVerifiedAt
      } : undefined,
      detectedCompany: companyProfile ? {
        value: (companyProfile.company.properties as any).name,
        confidence: Math.round(companyProfile.company.confidence), 
        source: "osint_platform",
        lastVerified: companyProfile.company.lastVerifiedAt
      } : undefined,
      currentLocation: personProfile?.address ? {
        value: (personProfile.address.properties as any).raw,
        confidence: Math.round(personProfile.address.confidence),
        source: "osint_platform",
        lastVerified: personProfile.address.lastVerifiedAt
      } : undefined,
      education: [], // Not implemented in new system yet
      experience: [], // Not implemented in new system yet
      phoneAssociations: [], // Not implemented in new system yet
      socialMetrics: [], // Not implemented in new system yet  
      publicMentions: this.convertNewsItems(personProfile?.newsItems || [])
    };
  }

  private convertNewsItems(newsEntities: any[]): any[] {
    return newsEntities.map(entity => {
      const props = entity.properties;
      return {
        title: props.title,
        url: props.url,
        date: props.publishedAt,
        source: props.source,
        snippet: props.snippet || "",
        category: props.category,
        relevance: Math.round(entity.confidence)
      };
    });
  }

  private buildSourcesList(result: InvestigationResult): any[] {
    // Extract unique domains from the investigation
    const sources: any[] = [];
    
    // Add providers used as sources
    if (result.metrics.providers) {
      Object.keys(result.metrics.providers).forEach(providerId => {
        sources.push({
          name: providerId,
          url: `https://${providerId}.com`, // Generic URL
          reliability: Math.round(Math.random() * 40 + 60) // Placeholder reliability
        });
      });
    }
    
    return sources.slice(0, 10); // Limit to top 10 sources
  }

  private buildInsights(
    result: InvestigationResult,
    personProfile: PersonProfileView | null,
    companyProfile: CompanyProfileView | null
  ): string[] {
    const insights: string[] = [];

    // Conclusions first — actionable statements a salesperson can use
    // ("Está contratando vendedores", "Empresa en expansión"), derived from
    // news-agent.ts's existing category classification. This used to be
    // discarded entirely; buildInsights() only ever surfaced raw counts
    // (N social profiles, N news items, investigation took Xs), which say
    // nothing about the lead itself.
    const allNewsItems = [
      ...(personProfile?.newsItems ?? []),
      ...(companyProfile?.newsItems ?? []),
    ];
    insights.push(...buildNewsConclusions(allNewsItems).map((c) => `📈 ${c}`));

    insights.push(
      result.identityVerified
        ? `✅ Identidad verificada con ${Math.round(result.overallConfidence)}% de confianza`
        : `⚠️ Identidad no verificada. Confianza: ${Math.round(result.overallConfidence)}%`
    );

    if (companyProfile) {
      insights.push(`🏢 Empresa confirmada: ${(companyProfile.company.properties as any).name}`);
    }

    return insights;
  }

  private createFailedLegacyResult(client: ClientInput, startTime: number, error: string): EnrichmentResult {
    return {
      enrichmentId: `failed_${Date.now()}`,
      timestamp: new Date().toISOString(),
      pipelineDuration: Date.now() - startTime,
      overallConfidence: 0,
      identity: {
        verified: false,
        confidence: 0,
        matchedSignals: [],
        message: `Error en la investigación: ${error}`
      },
      profession: null,
      title: null,
      socialProfiles: [],
      company: null,
      profileDetails: {
        detectedRole: undefined,
        detectedCompany: undefined,
        currentLocation: undefined,
        education: [],
        experience: [],
        phoneAssociations: [],
        socialMetrics: [],
        publicMentions: []
      },
      news: [],
      aiAnalysis: null,
      sources: [],
      insights: [`❌ Error en la investigación OSINT: ${error}`]
    };
  }
}