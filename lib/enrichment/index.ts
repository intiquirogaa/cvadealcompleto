/**
 * @deprecated This orchestrator is dead code — not imported by any API route.
 * The active orchestrator is ProfileEnrichmentService in services/profile-enrichment.service.ts.
 * The new OSINT platform lives in `lib/osint/`.
 * Scheduled for removal in Phase 2.
 */

// ============================================================
// OSINT Enrichment Pipeline — Orchestrator (DEPRECATED)
// ============================================================

import { generateInitialQueries, generateRecursiveQueries } from "./planner";
import { multiSearch } from "./searcher";
import { resolveIdentity } from "./utils/identity-resolver";
import { extractWebData } from "./modules/web-research";
import { extractSocialProfiles } from "./modules/social-profiles";
import { extractCompanyData } from "./modules/company-research";
import { extractNews } from "./modules/news-research";
import { extractPhoneAssociations } from "./modules/phone-research";
import { inspectPagesForPhoneEvidence } from "./modules/page-inspection";
import { analyzeWithAI } from "./modules/ai-analyzer";
import { weightedConfidence } from "./utils/confidence";
import type {
  ClientInput,
  EnrichmentResult,
  SourceEntry,
  SearchResult,
  IdentityResult,
  EnrichedDatum,
} from "./types";

export async function enrichClient(
  client: ClientInput
): Promise<EnrichmentResult> {
  const startTime = Date.now();
  console.log(
    `[enrichment] Starting pipeline for ${client.firstName} ${client.lastName}`
  );

  // STAGE 1: Dynamic Search Planning (Initial)
  const initialQueries = generateInitialQueries(client);
  console.log(
    `[enrichment] Planner generated ${initialQueries.length} initial queries.`
  );

  // STAGE 2: Execute Initial Search Batch
  const initialEvidence = await multiSearch(initialQueries);

  // STAGE 3: Identity Verification on Initial Evidence
  const identity = resolveIdentity(client, initialEvidence);

  if (!identity.verified) {
    console.log(
      `[enrichment] Identity not verified for ${client.firstName}. Proceeding with pipeline anyway to show partial results.`
    );
  }

  // STAGE 4: Recursive Expansion (Company / Domain)
  // Let's tentatively extract company data to see if we can expand the search
  const tentativeCompany = extractCompanyData(client, initialEvidence);
  let allEvidence = [...initialEvidence];

  if (
    tentativeCompany.company?.name.value &&
    tentativeCompany.company.name.value !== client.company
  ) {
    console.log(
      `[enrichment] Found company name: ${tentativeCompany.company.name.value}, launching recursive search...`
    );
    const recursiveQueries = generateRecursiveQueries(
      client,
      tentativeCompany.company.name.value
    );
    if (recursiveQueries.length > 0) {
      const recursiveEvidence = await multiSearch(recursiveQueries);
      // Merge and deduplicate evidence based on URL
      const evidenceMap = new Map<string, SearchResult>();
      allEvidence.forEach(e => evidenceMap.set(e.url, e));
      recursiveEvidence.forEach(e => evidenceMap.set(e.url, e));
      allEvidence = Array.from(evidenceMap.values());
    }
  }

  // STAGE 5: Passive Extraction
  // Inspect promising result pages directly because search snippets often hide phone numbers.
  const pagePhoneEvidence = await inspectPagesForPhoneEvidence(
    client,
    allEvidence
  );
  if (pagePhoneEvidence.length > 0) {
    const evidenceMap = new Map<string, SearchResult>();
    allEvidence.forEach(e => evidenceMap.set(e.url, e));
    pagePhoneEvidence.forEach(e => evidenceMap.set(e.url, e));
    allEvidence = Array.from(evidenceMap.values());
  }

  // Now pass the aggregated evidence pool to all modules to extract structured data
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

  // Combine and deduplicate sources from ALL extracted data points
  // Actually, now the source is attached to every EnrichedDatum. We can build the sources list globally.
  const allSourcesMap = new Map<string, SourceEntry>();
  const firstName = client.firstName.toLowerCase();
  const lastName = client.lastName.toLowerCase();
  const fullName = `${firstName} ${lastName}`;

  allEvidence
    .filter(e => {
      const text = `${e.title} ${e.snippet} ${e.url}`.toLowerCase();
      return (
        text.includes(fullName) ||
        (lastName.length > 3 && text.includes(lastName))
      );
    })
    .slice(0, 15)
    .forEach(e => {
      try {
        const hostname = new URL(e.url).hostname.replace("www.", "");
        if (
          !allSourcesMap.has(hostname) ||
          allSourcesMap.get(hostname)!.reliability < e.relevanceScore
        ) {
          allSourcesMap.set(hostname, {
            name: hostname,
            url: e.url,
            reliability: e.relevanceScore,
          });
        }
      } catch {}
    });
  const sources = Array.from(allSourcesMap.values()).sort(
    (a, b) => b.reliability - a.reliability
  );

  // STAGE 6: AI Analysis
  let aiAnalysis = null;
  let aiErrorMsg = null;
  try {
    aiAnalysis = await analyzeWithAI({
      client,
      identity,
      web,
      social,
      company,
      news,
    });
  } catch (err: any) {
    if (err.message === "API_KEY_UNAUTHORIZED")
      aiErrorMsg = "Análisis IA no disponible (API Key inválida)";
    else if (err.message === "QUOTA_EXCEEDED_OR_RATE_LIMIT")
      aiErrorMsg = "Análisis IA no disponible (Límite de cuota excedido)";
    else aiErrorMsg = "Análisis IA no disponible (API Key faltante o error)";
  }

  // Calculate Overall Confidence
  const aiConf = aiAnalysis ? aiAnalysis.overallConfidence : 0;
  const overallConfidence = weightedConfidence([
    { value: identity.confidence, weight: 0.5 },
    { value: aiConf, weight: 0.5 },
  ]);

  // Generate Insights for the UI
  const insights: string[] = [identity.message];
  if (aiErrorMsg) insights.push(`⚠️ ${aiErrorMsg}`);
  else if (aiAnalysis?.summary) insights.push(aiAnalysis.summary);

  if (web.profession)
    insights.push(
      `Profesión detectada: ${web.profession.value} (${web.profession.confidence}% de certeza)`
    );
  if (profileDetails.detectedCompany)
    insights.push(
      `Empresa/cargo detectado: ${profileDetails.detectedCompany.value}`
    );
  if (profileDetails.currentLocation)
    insights.push(
      `Ubicación confirmada: ${profileDetails.currentLocation.value}`
    );
  if (profileDetails.education.length > 0)
    insights.push(
      `Educación detectada: ${profileDetails.education.map(e => e.value).join(", ")}`
    );
  if (profileDetails.experience.length > 0)
    insights.push(
      `Experiencia detectada: ${profileDetails.experience.map(e => e.value).join(", ")}`
    );
  if (profileDetails.socialMetrics.length > 0)
    insights.push(
      `Métricas sociales detectadas: ${profileDetails.socialMetrics.map(m => `${m.platform}: ${m.followers || "s/d"} seguidores`).join(", ")}`
    );
  if (profileDetails.phoneAssociations.length > 0)
    insights.push(
      `${profileDetails.phoneAssociations.length} asociaciones públicas encontradas por teléfono.`
    );
  if (company.company)
    insights.push(`Empresa verificada: ${company.company.name.value}`);
  if (news.news.length > 0)
    insights.push(
      `${news.news.length} noticias/menciones relevantes encontradas.`
    );
  if (pagePhoneEvidence.length > 0)
    insights.push(
      `${pagePhoneEvidence.length} páginas inspeccionadas confirmaron el teléfono dentro del contenido.`
    );

  const pipelineDuration = Date.now() - startTime;
  console.log(
    `[enrichment] Pipeline finished for ${client.firstName} in ${pipelineDuration}ms. Score: ${overallConfidence}`
  );

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

function buildEmptyResult(
  client: ClientInput,
  identity: IdentityResult,
  startTime: number
): EnrichmentResult {
  return {
    enrichmentId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    pipelineDuration: Date.now() - startTime,
    overallConfidence: identity.confidence,
    identity,
    profession: null,
    title: null,
    socialProfiles: [],
    company: null,
    profileDetails: {
      education: [],
      experience: [],
      phoneAssociations: [],
      socialMetrics: [],
      publicMentions: [],
    },
    news: [],
    aiAnalysis: null,
    sources: [],
    insights: [identity.message],
  };
}

export * from "./types";
