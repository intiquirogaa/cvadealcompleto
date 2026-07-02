import type { ClientInput, SearchResult } from "../types";

const MAX_PAGES_TO_INSPECT = 12;
const MAX_HTML_CHARS = 450_000;

function buildPhoneDigitVariants(phone?: string): string[] {
  if (!phone) return [];

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return [];

  const variants = new Set<string>();
  const add = (value: string) => {
    const normalized = value.replace(/\D/g, "");
    if (normalized.length >= 7) variants.add(normalized);
  };

  add(digits);

  const withoutArgentinaPrefix = digits.startsWith("54")
    ? digits.slice(2)
    : digits;
  const withoutMobilePrefix = withoutArgentinaPrefix.startsWith("9")
    ? withoutArgentinaPrefix.slice(1)
    : withoutArgentinaPrefix;
  const national = withoutMobilePrefix.startsWith("0")
    ? withoutMobilePrefix.slice(1)
    : withoutMobilePrefix;

  add(national);
  add(`54${national}`);
  add(`549${national}`);

  if (national.length >= 10) {
    const areaCode = national.slice(0, national.length - 7);
    const subscriber = national.slice(-7);
    add(`0${areaCode}15${subscriber}`);
    add(`${areaCode}15${subscriber}`);
    add(`${areaCode}${subscriber}`);
  }

  return Array.from(variants).sort((a, b) => b.length - a.length);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function extractContext(text: string, variants: string[]): string | null {
  const compact = digitsOnly(text);
  const matched = variants.find(v => compact.includes(v));
  if (!matched) return null;

  const phoneLikePattern = /(?:\+?54\s*)?(?:9\s*)?(?:0?\d{2,4}[\s.-]*)?(?:15[\s.-]*)?\d{3,4}[\s.-]*\d{3,4}/g;
  const matches = Array.from(text.matchAll(phoneLikePattern));
  const visibleMatch = matches.find(match => digitsOnly(match[0]).includes(matched));

  if (!visibleMatch?.index) {
    return `Teléfono publicado: ${matched}`;
  }

  const start = Math.max(0, visibleMatch.index - 160);
  const end = Math.min(text.length, visibleMatch.index + visibleMatch[0].length + 220);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function shouldInspectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (host.includes("bing.com") || host.includes("google.com")) return false;
    if (host.includes("youtube.com") || host.includes("youtu.be")) return false;
    if (host.includes("instagram.com")) return false;
    if (host.includes("linkedin.com")) return false;
    if (pathname.endsWith(".pdf") || pathname.endsWith(".jpg") || pathname.endsWith(".png")) return false;

    return true;
  } catch {
    return false;
  }
}

function candidateScore(client: ClientInput, result: SearchResult): number {
  const text = `${result.title} ${result.snippet} ${result.url}`.toLowerCase();
  let score = 0;

  if (text.includes(client.lastName.toLowerCase())) score += 4;
  if (text.includes(client.firstName.toLowerCase())) score += 2;
  if (client.locality && text.includes(client.locality.toLowerCase().split(/[,;]/)[0])) score += 3;
  if (/whatsapp|contacto|telefono|teléfono|venta|vende|alquiler|clasificado|servicio|turnos/.test(text)) score += 3;
  if (/mercadolibre|marketplace|olx|alamaula|argentino|cuitonline|dateas|guia|guía/.test(text)) score += 2;

  return score;
}

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.7",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return null;
    }

    const html = (await res.text()).slice(0, MAX_HTML_CHARS);
    return stripHtml(html);
  } catch {
    return null;
  }
}

export async function inspectPagesForPhoneEvidence(
  client: ClientInput,
  evidence: SearchResult[]
): Promise<SearchResult[]> {
  const variants = buildPhoneDigitVariants(client.phone);
  if (variants.length === 0) return [];

  const candidates = evidence
    .filter(result => shouldInspectUrl(result.url))
    .map(result => ({ result, score: candidateScore(client, result) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PAGES_TO_INSPECT)
    .map(item => item.result);

  const inspected = await Promise.allSettled(
    candidates.map(async result => {
      const text = await fetchPageText(result.url);
      if (!text) return null;

      const context = extractContext(text, variants);
      if (!context) return null;

      return {
        ...result,
        snippet: context,
        relevanceScore: Math.max(result.relevanceScore, 60),
      } satisfies SearchResult;
    })
  );

  return inspected
    .filter(
      (item): item is PromiseFulfilledResult<SearchResult> =>
        item.status === "fulfilled" && item.value !== null
    )
    .map(item => item.value);
}
