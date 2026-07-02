import { BaseSearchProvider, ProviderSearchResult } from "../base.provider";
import { BingProvider } from "../bing.provider";
import { GoogleProvider } from "../google.provider";

export class GenericSocialProvider extends BaseSearchProvider {
  readonly name: string;
  private siteQueryPrefix: string;
  private urlPattern: string;
  
  private bing = new BingProvider();
  private google = new GoogleProvider();

  constructor(name: string, domain: string, urlPattern: string) {
    super();
    this.name = name;
    this.siteQueryPrefix = `site:${domain}`;
    this.urlPattern = urlPattern;
  }

  async search(query: string, clientData?: any): Promise<ProviderSearchResult[]> {
    const fullQuery = `${this.siteQueryPrefix} ${query}`;
    
    const [bingResults, googleResults] = await Promise.all([
      this.bing.search(fullQuery),
      this.google.search(fullQuery)
    ]);

    const allResults = [...bingResults, ...googleResults];
    const uniqueResults = new Map<string, ProviderSearchResult>();

    for (const res of allResults) {
      if (res.url.includes(this.urlPattern)) {
        uniqueResults.set(res.url, {
          source: this.name,
          url: res.url,
          title: res.title,
          snippet: res.snippet,
          confidence: 0,
        });
      }
    }

    return Array.from(uniqueResults.values());
  }
}
