import { BaseSearchProvider, ProviderSearchResult } from "../base.provider";
import { BingProvider } from "../bing.provider";
import { GoogleProvider } from "../google.provider";

export class LinkedInProvider extends BaseSearchProvider {
  readonly name = "LinkedIn";
  private bing = new BingProvider();
  private google = new GoogleProvider();

  async search(query: string, clientData?: any): Promise<ProviderSearchResult[]> {
    const siteQuery = `site:linkedin.com/in/ ${query}`;
    
    // Execute searches in parallel to maximize results
    const [bingResults, googleResults] = await Promise.all([
      this.bing.search(siteQuery),
      this.google.search(siteQuery)
    ]);

    const allResults = [...bingResults, ...googleResults];
    const uniqueResults = new Map<string, ProviderSearchResult>();

    for (const res of allResults) {
      if (res.url.includes("linkedin.com/in/")) {
        // Extract basic data from title/snippet
        const extractedData: Record<string, string> = {};
        
        const titleParts = res.title?.split("-") || [];
        if (titleParts.length > 1) {
          extractedData.name = titleParts[0].trim();
          extractedData.titleOrCompany = titleParts[1].trim();
        }

        uniqueResults.set(res.url, {
          source: this.name,
          url: res.url,
          title: res.title,
          snippet: res.snippet,
          confidence: 0,
          extractedData
        });
      }
    }

    return Array.from(uniqueResults.values());
  }
}
