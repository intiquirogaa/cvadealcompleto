import { BaseSearchProvider, ProviderSearchResult } from "./base.provider";
import { browserPool } from "../../osint/core/infrastructure/browser-pool";

const SEARCH_URL = "https://html.duckduckgo.com/html/";

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
      const url = `${SEARCH_URL}?${params}`;

      console.log(`[GoogleProvider] Executing query (attempt ${attempt}): "${query}"`);
      const startTime = Date.now();

      // Navigated with a real headless browser (not raw fetch) for the same
      // bot-detection reasons as BingProvider.
      const html = await browserPool.withPage(async (page) => {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 10000,
        });
        if (response && response.status() === 429) {
          throw Object.assign(new Error("Search fetch failed: 429"), { status: 429 });
        }
        if (response && !response.ok()) {
          throw Object.assign(
            new Error(`Search fetch failed: ${response.status()}`),
            { status: response.status() }
          );
        }
        await page.waitForSelector(".result__body", { timeout: 5000 }).catch(() => {});
        return page.content();
      });

      htmlCache.set(query, html);

      console.log(`[GoogleProvider] Query "${query}" finished in ${Date.now() - startTime}ms`);
      return html;
    } catch (err: any) {
      if (err.status === 429 && attempt <= 3) {
        console.warn(`[GoogleProvider] Rate limited (429) for "${query}". Retrying in ${attempt * 2}s...`);
        release();
        await delay(attempt * 2000);
        return this.fetchHtml(query, attempt + 1);
      }
      if ((err.name === "TimeoutError" || /timeout/i.test(err.message ?? "")) && attempt <= 2) {
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
