/**
 * @deprecated This searcher is dead code — only used by the deprecated index.ts orchestrator.
 * The new search infrastructure lives in `lib/osint/core/providers/` and
 * `lib/osint/core/infrastructure/http-client.ts`.
 * Scheduled for removal in Phase 2.
 */

// ============================================================
// OSINT Enrichment Pipeline — Enterprise Search Engine (DEPRECATED)
// ============================================================
import type { SearchResult } from "./types";

const SEARCH_URL = "https://www.bing.com/search";
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
];

/** Cache en memoria por ciclo de request para no repetir descargas */
const htmlCache = new Map<string, string>();

/** Límite de concurrencia simple */
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

async function fetchHtml(query: string, attempt = 1): Promise<string> {
  if (htmlCache.has(query)) {
    return htmlCache.get(query)!;
  }

  await acquireSlot();
  try {
    const params = new URLSearchParams({
      q: query,
      sp: "-1",
    });
    const userAgent =
      USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    console.log(`[searcher] Executing query (attempt ${attempt}): "${query}"`);
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
        console.warn(
          `[searcher] Rate limited (429) for "${query}". Retrying in ${attempt * 2}s...`
        );
        await delay(attempt * 2000);
        return fetchHtml(query, attempt + 1);
      }
      throw new Error(`Search fetch failed: ${res.status}`);
    }

    const html = await res.text();
    htmlCache.set(query, html);

    console.log(
      `[searcher] Query "${query}" finished in ${Date.now() - startTime}ms`
    );
    return html;
  } catch (err: any) {
    if (err.name === "TimeoutError" && attempt <= 2) {
      console.warn(`[searcher] Timeout for "${query}". Retrying in 2s...`);
      await delay(2000);
      return fetchHtml(query, attempt + 1);
    }
    throw err;
  } finally {
    releaseSlot();
    // Añadimos un pequeño delay para no ahogar
    await delay(300);
  }
}

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

/** Parse Bing HTML into structured SearchResult objects */
function parseHtml(
  html: string
): Array<{ url: string; title: string; snippet: string }> {
  const results: Array<{ url: string; title: string; snippet: string }> = [];
  const algoRegex =
    /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>(?=\s*<li|\s*<\/ul>)/g;
  let match;

  while ((match = algoRegex.exec(html)) !== null) {
    const block = match[1];
    const titleMatch =
      /<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/.exec(block);

    let title = "";
    let url = "";

    if (titleMatch) {
      url = decodeBingUrl(titleMatch[1]);
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
      results.push({ url, title, snippet });
    }
  }

  return results;
}

/** Execute a single query */
export async function search(query: string): Promise<SearchResult[]> {
  try {
    const html = await fetchHtml(query);
    const raw = parseHtml(html);
    return raw
      .map(r => ({ ...r, relevanceScore: 0 }))
      .filter(r => r.url !== "");
  } catch (err) {
    console.error(`[searcher] Error searching "${query}":`, err);
    return [];
  }
}

/** Execute multiple queries in parallel with internal limits and return deduplicated results */
export async function multiSearch(queries: string[]): Promise<SearchResult[]> {
  console.log(`[searcher] multiSearch invoked with ${queries.length} queries.`);

  const batches = await Promise.allSettled(queries.map(q => search(q)));

  const seen = new Set<string>();
  const all: SearchResult[] = [];

  for (const batch of batches) {
    if (batch.status === "fulfilled") {
      for (const result of batch.value) {
        if (result.url && !seen.has(result.url)) {
          seen.add(result.url);
          all.push(result);
        }
      }
    }
  }

  console.log(
    `[searcher] Extracted ${all.length} unique results from ${queries.length} queries.`
  );
  return all;
}
