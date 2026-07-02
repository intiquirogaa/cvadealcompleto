import type { ClientInput, SearchResult, CompanyData } from "../types";
import { normalizeText, scoreDataPoint } from "../utils/evidence-ranking";

export interface CompanyResearchResult {
  company: CompanyData | null;
}

export function extractCompanyData(
  client: ClientInput,
  evidence: SearchResult[]
): CompanyResearchResult {
  const normCompanyInput = client.company ? normalizeText(client.company) : "";
  const genericCompanies = new Set([
    "independiente",
    "empresa privada",
    "sin empresa",
    "no registrada",
    "empresa",
  ]);

  if (!client.company || genericCompanies.has(normCompanyInput)) {
    return { company: null };
  }

  const normCompany = normCompanyInput;
  let bestWebsite: string | null = null;
  let bestWebsiteSource = "";
  let industry: string | null = null;
  let industrySource = "";

  for (const res of evidence) {
    const text = normalizeText(res.title + " " + res.snippet);
    const urlLower = res.url.toLowerCase();

    if (text.includes(normCompany)) {
      // Very naive website extraction - look for the first domain that matches the company name
      // and isn't a social network or generic directory
      if (!bestWebsite && urlLower.includes(normCompany.replace(/\s+/g, ""))) {
        if (
          !urlLower.includes("linkedin.com") &&
          !urlLower.includes("facebook.com")
        ) {
          bestWebsite = res.url;
          bestWebsiteSource = res.url;
        }
      }

      // Very naive industry extraction based on keywords
      if (!industry) {
        if (text.includes("constructora") || text.includes("arquitectura")) {
          industry = "Construcción / Arquitectura";
          industrySource = res.url;
        } else if (text.includes("tecnología") || text.includes("software")) {
          industry = "Tecnología";
          industrySource = res.url;
        } else if (
          text.includes("inmobiliaria") ||
          text.includes("real estate")
        ) {
          industry = "Real Estate";
          industrySource = res.url;
        }
      }
    }
  }

  return {
    company: {
      name: scoreDataPoint(
        client.company,
        bestWebsiteSource || "CRM",
        client,
        evidence,
        100
      ), // Name comes from input
      website: bestWebsite
        ? scoreDataPoint(bestWebsite, bestWebsiteSource, client, evidence, 80)
        : undefined,
      industry: industry
        ? scoreDataPoint(industry, industrySource, client, evidence, 70)
        : undefined,
      socialProfiles: [], // Will be filled recursively if needed
      recentNews: [], // Will be filled by news extractor
    },
  };
}
