import { ClientInput, EnrichmentResult, SearchResult, SourceEntry, EnrichedDatum } from '../types';
import { generateInitialQueries, generateRecursiveQueries } from '../planner';
import { resolveIdentity } from '../utils/identity-resolver';
import { extractWebData } from '../modules/web-research';
import { extractSocialProfiles } from '../modules/social-profiles';
import { extractCompanyData } from '../modules/company-research';
import { extractNews } from '../modules/news-research';
import { extractPhoneAssociations } from '../modules/phone-research';
import { inspectPagesForPhoneEvidence } from '../modules/page-inspection';
import { analyzeWithAI } from '../modules/ai-analyzer';
import { weightedConfidence } from '../utils/confidence';

import { BingProvider } from '../providers/bing.provider';
import { GoogleProvider } from '../providers/google.provider';
import { LinkedInProvider } from '../providers/social/linkedin.provider';
import { GenericSocialProvider } from '../providers/social/generic.provider';

export class ProfileEnrichmentService {
  private bing = new BingProvider();
  private google = new GoogleProvider();
  
  private socialProviders = [
    new LinkedInProvider(),
    new GenericSocialProvider('GitHub', 'github.com', 'github.com/'),
    new GenericSocialProvider('Twitter', 'twitter.com OR x.com', 'twitter.com/'),
    new GenericSocialProvider('Instagram', 'instagram.com', 'instagram.com/'),
    new GenericSocialProvider('Facebook', 'facebook.com', 'facebook.com/')
  ];

  async enrich(client: ClientInput): Promise<EnrichmentResult> {
    const startTime = Date.now();
    console.log(`[EnrichmentService] Starting pipeline for ${client.firstName} ${client.lastName}`);

    // STAGE 1: Planning
    const initialQueries = generateInitialQueries(client);
    
    // STAGE 2 & 3: General Search (Bing + Google)
    const initialEvidenceRaw = await this.executeGeneralSearch(initialQueries);
    let allEvidence = this.mapToLegacyFormat(initialEvidenceRaw);

    // STAGE 3.5: Identity Verification
    const identity = resolveIdentity(client, allEvidence);
    
    // STAGE 4: Recursive Expansion & Social Search
    const tentativeCompany = extractCompanyData(client, allEvidence);
    if (tentativeCompany.company?.name.value && tentativeCompany.company.name.value !== client.company) {
      const recursiveQueries = generateRecursiveQueries(client, tentativeCompany.company.name.value);
      if (recursiveQueries.length > 0) {
        const recursiveRaw = await this.executeGeneralSearch(recursiveQueries);
        const recursiveLegacy = this.mapToLegacyFormat(recursiveRaw);
        allEvidence = this.mergeEvidence(allEvidence, recursiveLegacy);
      }
    }

    // Execute social specific searches
    const socialRaw = await this.executeSocialSearch(`${client.firstName} ${client.lastName}`);
    const socialLegacy = this.mapToLegacyFormat(socialRaw);
    allEvidence = this.mergeEvidence(allEvidence, socialLegacy);

    // Passive Extraction (Deep Search for Phones)
    const pagePhoneEvidence = await inspectPagesForPhoneEvidence(client, allEvidence);
    allEvidence = this.mergeEvidence(allEvidence, pagePhoneEvidence);

    // STAGE 5: Consolidation & Data Extraction
    // Existing modules apply the priority rules (LinkedIn > Official > Google) internally using evidence-ranking.ts
    const web = extractWebData(client, allEvidence);
    const social = extractSocialProfiles(client, allEvidence);
    const company = extractCompanyData(client, allEvidence);
    const news = extractNews(client, allEvidence);
    const phoneAssociations = extractPhoneAssociations(client, allEvidence);
    
    const profileDetails = {
      ...web.profileDetails,
      phoneAssociations,
      publicMentions: news.news,
    };

    // Build Sources list based on reliability
    const sources = this.buildSourcesList(allEvidence, client);

    // STAGE 6: AI Analysis
    let aiAnalysis = null;
    let aiErrorMsg = null;
    try {
      aiAnalysis = await analyzeWithAI({ client, identity, web, social, company, news });
    } catch (err: any) {
      aiErrorMsg = "Análisis IA no disponible";
    }

    const aiConf = aiAnalysis ? aiAnalysis.overallConfidence : 0;
    const overallConfidence = weightedConfidence([
      { value: identity.confidence, weight: 0.5 },
      { value: aiConf, weight: 0.5 },
    ]);

    const insights = this.generateInsights(identity, aiErrorMsg, aiAnalysis, web, profileDetails, company, news, pagePhoneEvidence);
    const pipelineDuration = Date.now() - startTime;

    return {
      enrichmentId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      pipelineDuration,
      overallConfidence,
      identity,
      profession: web.profession as EnrichedDatum<string> | null,
      title: web.title as EnrichedDatum<string> | null,
      socialProfiles: social.profiles,
      company: company.company,
      profileDetails,
      news: news.news,
      aiAnalysis,
      sources,
      insights,
    };
  }

  private async executeGeneralSearch(queries: string[]) {
    // Round-robin execution between Google and Bing to balance load
    const allPromises = [];
    for (let i = 0; i < queries.length; i++) {
      if (i % 2 === 0) {
        allPromises.push(this.bing.search(queries[i]));
      } else {
        allPromises.push(this.google.search(queries[i]));
      }
    }
    const resultsArrays = await Promise.all(allPromises);
    return resultsArrays.flat();
  }

  private async executeSocialSearch(baseQuery: string) {
    const promises = this.socialProviders.map(provider => provider.search(baseQuery));
    const resultsArrays = await Promise.all(promises);
    return resultsArrays.flat();
  }

  private mapToLegacyFormat(providerResults: any[]): SearchResult[] {
    const seen = new Set<string>();
    const legacy: SearchResult[] = [];
    
    for (const r of providerResults) {
      if (r.url && !seen.has(r.url)) {
        seen.add(r.url);
        legacy.push({
          url: r.url,
          title: r.title || '',
          snippet: r.snippet || '',
          relevanceScore: r.confidence || 0
        });
      }
    }
    return legacy;
  }

  private mergeEvidence(existing: SearchResult[], newer: SearchResult[]): SearchResult[] {
    const evidenceMap = new Map<string, SearchResult>();
    existing.forEach(e => evidenceMap.set(e.url, e));
    newer.forEach(e => evidenceMap.set(e.url, e));
    return Array.from(evidenceMap.values());
  }

  private buildSourcesList(allEvidence: SearchResult[], client: ClientInput): SourceEntry[] {
    const allSourcesMap = new Map<string, SourceEntry>();
    const fullName = `${client.firstName} ${client.lastName}`.toLowerCase();
    
    allEvidence
      .filter(e => {
        const text = `${e.title} ${e.snippet} ${e.url}`.toLowerCase();
        return text.includes(fullName);
      })
      .slice(0, 15)
      .forEach(e => {
        try {
          const hostname = new URL(e.url).hostname.replace("www.", "");
          if (!allSourcesMap.has(hostname) || allSourcesMap.get(hostname)!.reliability < e.relevanceScore) {
            allSourcesMap.set(hostname, {
              name: hostname,
              url: e.url,
              reliability: e.relevanceScore,
            });
          }
        } catch {}
      });
      
    return Array.from(allSourcesMap.values()).sort((a, b) => b.reliability - a.reliability);
  }

  private generateInsights(identity: any, aiErrorMsg: any, aiAnalysis: any, web: any, profileDetails: any, company: any, news: any, pagePhoneEvidence: any) {
    const insights: string[] = [identity.message];
    if (aiErrorMsg) insights.push(`⚠️ ${aiErrorMsg}`);
    else if (aiAnalysis?.summary) insights.push(aiAnalysis.summary);

    if (web.profession) insights.push(`Profesión detectada: ${web.profession.value} (${web.profession.confidence}% de certeza)`);
    if (profileDetails.detectedCompany) insights.push(`Empresa/cargo detectado: ${profileDetails.detectedCompany.value}`);
    if (profileDetails.currentLocation) insights.push(`Ubicación confirmada: ${profileDetails.currentLocation.value}`);
    if (profileDetails.education.length > 0) insights.push(`Educación detectada: ${profileDetails.education.map((e: any) => e.value).join(", ")}`);
    if (profileDetails.experience.length > 0) insights.push(`Experiencia detectada: ${profileDetails.experience.map((e: any) => e.value).join(", ")}`);
    if (profileDetails.socialMetrics.length > 0) insights.push(`Métricas sociales detectadas: ${profileDetails.socialMetrics.map((m: any) => `${m.platform}: ${m.followers || "s/d"} seguidores`).join(", ")}`);
    if (profileDetails.phoneAssociations.length > 0) insights.push(`${profileDetails.phoneAssociations.length} asociaciones públicas encontradas por teléfono.`);
    if (company.company) insights.push(`Empresa verificada: ${company.company.name.value}`);
    if (news.news.length > 0) insights.push(`${news.news.length} noticias/menciones relevantes encontradas.`);
    if (pagePhoneEvidence.length > 0) insights.push(`${pagePhoneEvidence.length} páginas inspeccionadas confirmaron el teléfono dentro del contenido.`);
    return insights;
  }
}
