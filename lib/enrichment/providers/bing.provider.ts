import { BaseSearchProvider, ProviderSearchResult } from "./base.provider";
import { browserPool } from "../../osint/core/infrastructure/browser-pool";

const SEARCH_URL = "https://www.bing.com/search";

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

function decodeBingUrl(rawUrl: string): string {
  const decodedUrl = decodeHtmlEntities(rawUrl);
  try {
    const url = new URL(decodedUrl);
    const encodedTarget = url.searchParams.get("u");
    if (url.hostname.includes("bing.com") && encodedTarget) {
      const withoutPrefix = encodedTarget.startsWith("a1")
        ? encodedTarget.slice(2)
        : encodedTarget;
      const base64 = withoutPrefix.replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
      return Buffer.from(padded, "base64").toString("utf8");
    }
  } catch {}
  return decodedUrl;
}

export class BingProvider extends BaseSearchProvider {
  readonly name = "Bing";

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
        sp: "-1",
      });
      const url = `${SEARCH_URL}?${params}`;

      console.log(`[BingProvider] Executing query (attempt ${attempt}): "${query}"`);
      const startTime = Date.now();

      // Navigated with a real headless browser (not raw fetch): Bing serves
      // generic/blocked content to non-browser requests, which is why this
      // scraper used to return irrelevant results.
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
        // Give the results list a brief chance to render before reading the DOM.
        await page.waitForSelector("li.b_algo", { timeout: 5000 }).catch(() => {});
        return page.content();
      });

      htmlCache.set(query, html);

      console.log(`[BingProvider] Query "${query}" finished in ${Date.now() - startTime}ms`);
      return html;
    } catch (err: any) {
      if (err.status === 429 && attempt <= 3) {
        console.warn(`[BingProvider] Rate limited (429) for "${query}". Retrying in ${attempt * 2}s...`);
        release();
        await delay(attempt * 2000);
        return this.fetchHtml(query, attempt + 1);
      }
      if ((err.name === "TimeoutError" || /timeout/i.test(err.message ?? "")) && attempt <= 2) {
        console.warn(`[BingProvider] Timeout for "${query}". Retrying in 2s...`);
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
    const algoRegex = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>(?=\s*<li|\s*<\/ul>)/g;
    let match;

    while ((match = algoRegex.exec(html)) !== null) {
      const block = match[1];
      const titleMatch = /<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/.exec(block);

      let title = "";
      let url = "";

      if (titleMatch) {
        url = decodeBingUrl(titleMatch[1]);
        url = this.normalizeUrl(url);
        title = stripTags(titleMatch[2]);
      }

      const snippetMatch = /<p[^>]*>([\s\S]*?)<\/p>/.exec(block);
      let snippet = "";
      if (snippetMatch) {
        snippet = stripTags(snippetMatch[1]);
      } else {
        const bcc = /<div class="b_caption"[^>]*>([\s\S]*?)<\/div>/.exec(block);
        if (bcc) {
          snippet = stripTags(bcc[1]);
        }
      }

      if (url && !url.includes("/search?q=")) {
        results.push({
          source: this.name,
          url,
          title,
          snippet,
          confidence: 0, // Confidence will be calculated later by the Service
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
      console.error(`[BingProvider] Error searching "${query}":`, err);
      return [];
    }
  }
}
