export interface ProviderSearchResult {
  source: string;
  url: string;
  confidence: number;
  extractedData?: Record<string, any>;
  rawContent?: string;
  title?: string;
  snippet?: string;
}

export interface SearchProvider {
  /**
   * The name of the provider (e.g., 'Bing', 'Google', 'LinkedIn')
   */
  readonly name: string;

  /**
   * Execute a search using this provider
   * @param query The search query string
   * @param clientData Additional client context that might help the provider
   * @returns Array of structured search results
   */
  search(query: string, clientData?: any): Promise<ProviderSearchResult[]>;
}

export abstract class BaseSearchProvider implements SearchProvider {
  abstract readonly name: string;
  abstract search(query: string, clientData?: any): Promise<ProviderSearchResult[]>;

  protected normalizeUrl(url: string): string {
    try {
      const u = new URL(url);
      // Remove common tracking parameters
      u.searchParams.delete('utm_source');
      u.searchParams.delete('utm_medium');
      return u.toString();
    } catch {
      return url;
    }
  }

  protected extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }
}
