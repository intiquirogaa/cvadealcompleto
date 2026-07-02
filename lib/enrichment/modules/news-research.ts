import type { ClientInput, SearchResult, NewsItem } from "../types";
import { normalizeText } from "../utils/evidence-ranking";

export interface NewsResearchResult {
  news: NewsItem[];
}

export function extractNews(
  client: ClientInput,
  evidence: SearchResult[]
): NewsResearchResult {
  const normFirstName = normalizeText(client.firstName);
  const normLastName = normalizeText(client.lastName);
  const fullName = `${normFirstName} ${normLastName}`;
  const normCompanyInput = client.company ? normalizeText(client.company) : "";
  const genericCompanies = new Set([
    "independiente",
    "empresa privada",
    "sin empresa",
    "no registrada",
    "empresa",
  ]);
  const normCompany =
    normCompanyInput && !genericCompanies.has(normCompanyInput)
      ? normCompanyInput
      : "";

  const news: NewsItem[] = [];
  const newsKeywords = [
    "noticia",
    "anuncia",
    "inversión",
    "premio",
    "expansión",
    "entrevista",
    "nombra",
    "contrata",
    "licitación",
    "galardón",
    "evento",
  ];

  for (const res of evidence) {
    const text = normalizeText(res.title + " " + res.snippet);

    // Si contiene una entidad suficientemente específica (nombre completo/apellido o empresa real).
    // No alcanza solo con el primer nombre porque puede traer ruido, por ejemplo "INTI" organismo público.
    if (
      text.includes(fullName) ||
      text.includes(normLastName) ||
      (normCompany && text.includes(normCompany))
    ) {
      let matchedCategory = "";
      for (const kw of newsKeywords) {
        if (text.includes(kw)) {
          matchedCategory = kw;
          break;
        }
      }

      // Además, si el título es largo y no es red social, a menudo es un artículo/noticia
      if (
        matchedCategory ||
        (!res.url.includes("linkedin.com") &&
          !res.url.includes("instagram.com") &&
          res.title.length > 30)
      ) {
        let hostname = res.url;
        try {
          hostname = new URL(res.url).hostname;
        } catch {}

        news.push({
          title: res.title,
          url: res.url,
          source: hostname,
          snippet: res.snippet,
          category: matchedCategory || "mención pública",
          relevance: 75, // Base score
        });
      }
    }
  }

  // Deduplicar por título similar (muy básico)
  const uniqueNews = news.filter(
    (n, index, self) =>
      index ===
      self.findIndex(t => t.title.substring(0, 20) === n.title.substring(0, 20))
  );

  return { news: uniqueNews.slice(0, 5) };
}
