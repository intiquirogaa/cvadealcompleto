import { BaseSearchProvider, ProviderSearchResult } from "./base.provider";

const SEARCH_URL = "https://html.duckduckgo.com/html/";
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
];

const htmlCache = new Map<string, string>();
const MAX_CONCURRENT = 5;
let activeRequests = 0;

async function acquireSlot(): Promise<void> {
  while (activeRequests >= MAX_CONCURRENT) {
    await new Promise(r => setTimeout(r, 100));
  }
  activeRequests++;
}

function releaseSlot(): void {
  activeRequests = Math.max(0, activeRequests - 1);
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    );
}

function stripTags(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export class GoogleProvider extends BaseSearchProvider {
  readonly name = "Google"; // Using DuckDuckGo HTML as a proxy for "Google-like" general search to avoid immediate CAPTCHAs

  private async fetchHtml(query: string, attempt = 1): Promise<string> {
    if (htmlCache.has(query)) {
      return htmlCache.get(query)!;
    }

    await acquireSlot();
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        releaseSlot();
      }
    };

    try {
      const params = new URLSearchParams({
        q: query,
      });
      const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

      console.log(`[GoogleProvider] Executing query (attempt ${attempt}): "${query}"`);
      const startTime = Date.now();

      const res = await fetch(`${SEARCH_URL}?${params}`, {
        headers: {
          "User-Agent": userAgent,
          "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        if (res.status === 429 && attempt <= 3) {
          console.warn(`[GoogleProvider] Rate limited (429) for "${query}". Retrying in ${attempt * 2}s...`);
          release();
          await delay(attempt * 2000);
          return this.fetchHtml(query, attempt + 1);
        }
        throw new Error(`Search fetch failed: ${res.status}`);
      }

      const html = await res.text();
      htmlCache.set(query, html);

      console.log(`[GoogleProvider] Query "${query}" finished in ${Date.now() - startTime}ms`);
      return html;
    } catch (err: any) {
      if (err.name === "TimeoutError" && attempt <= 2) {
        console.warn(`[GoogleProvider] Timeout for "${query}". Retrying in 2s...`);
        release();
        await delay(2000);
        return this.fetchHtml(query, attempt + 1);
      }
      throw err;
    } finally {
      release();
      await delay(300);
    }
  }

  private parseHtml(html: string): ProviderSearchResult[] {
    const results: ProviderSearchResult[] = [];
    const algoRegex = /<div class="[^"]*result__body[^"]*"[^>]*>([\s\S]*?)<\/div>(?=\s*<div class="[^"]*result__body|\s*<\/div>\s*<\/div>)/g;
    let match;

    while ((match = algoRegex.exec(html)) !== null) {
      const block = match[1];
      const titleMatch = /<a class="result__url" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);

      let title = "";
      let url = "";

      if (titleMatch) {
        try {
          const rawUrl = titleMatch[1];
          const ddgUrl = new URL(`https:${rawUrl}`);
          const targetUrl = ddgUrl.searchParams.get("uddg");
          url = targetUrl ? decodeURIComponent(targetUrl) : rawUrl;
          url = this.normalizeUrl(url);
        } catch {
          url = this.normalizeUrl(titleMatch[1]);
        }
        
        // title can be found in result__title
        const actualTitleMatch = /<h2 class="result__title"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/.exec(block);
        if (actualTitleMatch) {
          title = stripTags(actualTitleMatch[1]);
        }
      }

      const snippetMatch = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/.exec(block);
      let snippet = "";
      if (snippetMatch) {
        snippet = stripTags(snippetMatch[1]);
      }

      if (url) {
        results.push({
          source: this.name,
          url,
          title,
          snippet,
          confidence: 0,
        });
      }
    }

    return results;
  }

  async search(query: string, clientData?: any): Promise<ProviderSearchResult[]> {
    try {
      const html = await this.fetchHtml(query);
      return this.parseHtml(html);
    } catch (err) {
      console.error(`[GoogleProvider] Error searching "${query}":`, err);
      return [];
    }
  }
}
