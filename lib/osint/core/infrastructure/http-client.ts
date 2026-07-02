// ============================================================
// OSINT Platform — Shared HTTP Client
// ============================================================
// Centralized fetch with:
//   - Timeout support
//   - User-Agent rotation
//   - Content-type filtering
//   - Automatic retry + rate limiting integration
//   - Structured logging
//
// All providers use this client instead of raw fetch().
// ============================================================

import { logger } from "../observability/logger";
import { withRetry, type RetryConfig } from "./retry";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export interface HttpRequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  acceptLanguage?: string;
  /** Restrict to these content types (returns null if mismatch) */
  acceptContentTypes?: string[];
  /** Max bytes to read from the response */
  maxBytes?: number;
  retryConfig?: RetryConfig;
  /** Context label for logging */
  contextLabel?: string;
  /** Metadata for structured logging */
  logMeta?: Record<string, unknown>;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  text: string;
  contentType: string;
}

/**
 * Fetch a URL with timeout, retry, and content-type filtering.
 * Returns null if the content-type doesn't match acceptContentTypes.
 */
export async function httpFetch(
  url: string,
  options: HttpRequestOptions = {}
): Promise<HttpResponse | null> {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = 10000,
    acceptLanguage = "es-419,es;q=0.9,en;q=0.8",
    acceptContentTypes,
    maxBytes = 500_000,
    retryConfig,
    contextLabel = "httpFetch",
    logMeta = {},
  } = options;

  const execute = async (): Promise<HttpResponse | null> => {
    const startTime = Date.now();
    const userAgent = randomUserAgent();

    const res = await fetch(url, {
      method,
      headers: {
        "User-Agent": userAgent,
        "Accept-Language": acceptLanguage,
        ...headers,
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const contentType = res.headers.get("content-type") || "";

    // Content-type filtering
    if (acceptContentTypes && acceptContentTypes.length > 0) {
      const matches = acceptContentTypes.some((ct) =>
        contentType.toLowerCase().includes(ct.toLowerCase())
      );
      if (!matches) {
        logger.debug("Skipping response (content-type mismatch)", {
          ...logMeta,
          url,
          contentType,
          expected: acceptContentTypes,
          durationMs: Date.now() - startTime,
        });
        return null;
      }
    }

    const text = await res.text();
    const truncated = text.slice(0, maxBytes);

    if (!res.ok) {
      logger.warn("HTTP request failed", {
        ...logMeta,
        url,
        status: res.status,
        statusText: res.statusText,
        durationMs: Date.now() - startTime,
      });
    } else {
      logger.debug("HTTP request succeeded", {
        ...logMeta,
        url,
        status: res.status,
        durationMs: Date.now() - startTime,
        responseBytes: truncated.length,
      });
    }

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
      text: truncated,
      contentType,
    };
  };

  // Wrap in retry if configured
  if (retryConfig) {
    try {
      return await withRetry(execute, retryConfig, contextLabel);
    } catch {
      return null;
    }
  }

  try {
    return await execute();
  } catch (err) {
    logger.error("HTTP request error", {
      ...logMeta,
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Fetch a URL and return only the text content.
 * Convenience wrapper for page-fetching providers.
 */
export async function fetchPageText(
  url: string,
  options?: HttpRequestOptions
): Promise<string | null> {
  const res = await httpFetch(url, {
    acceptContentTypes: ["text/html", "text/plain", "application/xhtml"],
    ...options,
  });
  return res?.text || null;
}
