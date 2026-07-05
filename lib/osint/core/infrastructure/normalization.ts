// ============================================================
// OSINT Platform — Centralized Normalization Utilities
// ============================================================
// Single source of truth for all text/URL/phone/name/email
// normalization and HTML parsing helpers.
//
// Replaces the duplicated logic that existed in:
//   - lib/enrichment/utils/variant-generator.ts
//   - lib/enrichment/utils/evidence-ranking.ts (normalizeText)
//   - lib/enrichment/modules/phone-research.ts (buildPhoneVariants)
//   - lib/enrichment/modules/page-inspection.ts (buildPhoneDigitVariants)
//   - lib/enrichment/searcher.ts (decodeHtmlEntities, stripTags)
//   - lib/enrichment/providers/bing.provider.ts (same)
// ============================================================

// ─────────────────────────────────────────────────────────────
// TEXT NORMALIZATION
// ─────────────────────────────────────────────────────────────

/**
 * Normalize text: remove accents, lowercase, strip special chars.
 * Used everywhere for matching text against client identity signals.
 */
export function normalizeText(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s@.]/gi, "")
    .trim();
}

/** Strip HTML tags and decode entities from a string */
export function stripTags(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Decode common HTML entities */
export function decodeHtmlEntities(value: string): string {
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

/** Strip HTML tags from full page content (scripts, styles, etc.) */
export function stripHtml(html: string): string {
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

/** Sanitize a search snippet — remove HTML, collapse whitespace */
export function sanitizeSnippet(snippet: string): string {
  if (!snippet) return "";
  return snippet
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────
// URL NORMALIZATION
// ─────────────────────────────────────────────────────────────

/** Tracking parameters to strip from URLs */
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "msclkid",
  "mc_eid",
  "_ga",
];

/**
 * Canonicalize a URL: strip tracking params, normalize protocol/www.
 * Returns the original string if parsing fails.
 */
export function canonicalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    // Normalize: lowercase host, strip www, https
    url.protocol = "https:";
    url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();

    // Remove tracking parameters
    for (const param of TRACKING_PARAMS) {
      url.searchParams.delete(param);
    }

    // Remove trailing slash on root paths
    if (url.pathname === "/") url.pathname = "";

    // Remove hash (fragment) — not relevant for content identity
    url.hash = "";

    return url.toString();
  } catch {
    return rawUrl;
  }
}

/** Extract the domain (without www) from a URL */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Extract a canonical social profile key from a URL.
 * e.g. https://www.linkedin.com/in/juanperez/?utm_source=x → linkedin.com/in/juanperez
 */
export function canonicalSocialUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname.replace(/\/$/, "").toLowerCase();

    // For social profiles, the key is domain + path (without query)
    return `${host}${path}`;
  } catch {
    return canonicalizeUrl(url);
  }
}

// ─────────────────────────────────────────────────────────────
// PHONE NORMALIZATION & VARIANTS
// ─────────────────────────────────────────────────────────────

export interface PhoneVariant {
  value: string;
  digits: string;
  label: string;
}

/**
 * Given a phone number like +5492804823370, generates ALL possible
 * display/search/match variants:
 *   - Full international: 5492804823370
 *   - Without country code: 2804823370
 *   - With separators: 2804-823370, 2804 823370
 *   - Argentine mobile: 02804-15-823370
 *   - Last 7/8 digits: 823370, 4823370
 *
 * This is the SINGLE implementation — replaces the 3 duplicated
 * versions in variant-generator.ts, phone-research.ts, and
 * page-inspection.ts.
 */
export function generatePhoneVariants(phone?: string): PhoneVariant[] {
  if (!phone) return [];

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return [];

  const variants: PhoneVariant[] = [];
  const seen = new Set<string>();

  const add = (value: string, label: string) => {
    const d = value.replace(/\D/g, "");
    if (d.length < 6) return;
    if (seen.has(d)) return;
    seen.add(d);
    variants.push({ value, digits: d, label });
  };

  add(phone, "Original");
  add(digits, "Solo dígitos");

  // Strip Argentina prefix layers
  let withoutCountry = digits;
  if (digits.startsWith("54")) {
    withoutCountry = digits.slice(2);
    add("54" + withoutCountry, "Con código país");
    add("+54" + withoutCountry, "Con +54");
  }

  let withoutMobile = withoutCountry;
  if (withoutCountry.startsWith("9")) {
    withoutMobile = withoutCountry.slice(1);
    add("549" + withoutMobile, "Internacional móvil");
    add("+549" + withoutMobile, "Con +549");
  }

  let national = withoutMobile;
  if (national.startsWith("0")) {
    national = national.slice(1);
  }
  add(national, "Nacional");

  // Formatted variants from national number
  if (national.length >= 10) {
    for (const areaLen of [2, 3, 4]) {
      if (areaLen >= national.length) continue;
      const area = national.slice(0, areaLen);
      const subscriber = national.slice(areaLen);

      add(`${area}-${subscriber}`, `Área ${area} con guión`);
      add(`${area} ${subscriber}`, `Área ${area} con espacio`);
      add(`0${area}-${subscriber}`, `0${area} con guión`);
      add(`0${area} ${subscriber}`, `0${area} con espacio`);

      if (subscriber.length >= 7) {
        const sub7 = subscriber.slice(-7);
        const sub8 = subscriber.slice(-8);
        add(`0${area} 15 ${sub7}`, `Móvil 0${area} 15`);
        add(`0${area}-15-${sub7}`, `Móvil 0${area}-15`);
        add(`${area} 15 ${sub7}`, `Móvil ${area} 15`);
        add(`${area}-15-${sub7}`, `Móvil ${area}-15`);
        if (sub8 !== sub7) {
          add(`0${area} 15 ${sub8}`, `Móvil 0${area} 15 (8d)`);
          add(`${area} 15 ${sub8}`, `Móvil ${area} 15 (8d)`);
        }
      }

      if (subscriber.length >= 6) {
        const mid = Math.ceil(subscriber.length / 2);
        const part1 = subscriber.slice(0, mid);
        const part2 = subscriber.slice(mid);
        add(`${area}-${part1}-${part2}`, `Área ${area} triple segmento`);
        add(`${area} ${part1} ${part2}`, `Área ${area} triple espacio`);
      }
    }
  }

  if (national.length > 8) {
    add(national.slice(-8), "Últimos 8 dígitos");
    add(national.slice(-7), "Últimos 7 dígitos");
  }

  return variants;
}

/**
 * Returns only the digit-strings for fast matching inside text blobs.
 * Sorted longest-first for greedy matching.
 */
export function getPhoneDigitPatterns(phone?: string): string[] {
  return generatePhoneVariants(phone)
    .map((v) => v.digits)
    .filter((d) => d.length >= 7)
    .sort((a, b) => b.length - a.length);
}

/** Extract digits-only from any string */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

// ─────────────────────────────────────────────────────────────
// NAME NORMALIZATION & VARIANTS
// ─────────────────────────────────────────────────────────────

export interface NameVariant {
  value: string;
  normalized: string;
  strength: number;
  label: string;
}

/**
 * Generate all meaningful name combinations from first/last name.
 * e.g. "Inti Uriel Pichipillan Quiroga" →
 *   - Inti Uriel Pichipillan Quiroga (1.0)
 *   - Inti Pichipillan Quiroga (0.9)
 *   - Inti Quiroga (0.75)
 *   - etc.
 */
export function generateNameVariants(
  firstName: string,
  lastName: string
): NameVariant[] {
  const variants: NameVariant[] = [];
  const seen = new Set<string>();

  const addVariant = (value: string, strength: number, label: string) => {
    const normalized = normalizeText(value);
    if (normalized.length < 3) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    variants.push({ value, normalized, strength, label });
  };

  const firstParts = firstName.trim().split(/\s+/).filter(Boolean);
  const lastParts = lastName.trim().split(/\s+/).filter(Boolean);
  const allParts = [...firstParts, ...lastParts];

  addVariant(`${firstName} ${lastName}`, 1.0, "Nombre completo");

  if (firstParts.length > 1) {
    addVariant(`${firstParts[0]} ${lastName}`, 0.9, "Primer nombre + apellido completo");
  }

  if (lastParts.length > 1) {
    addVariant(`${firstName} ${lastParts[0]}`, 0.85, "Nombre completo + primer apellido");
  }

  if (firstParts.length > 1 || lastParts.length > 1) {
    addVariant(`${firstParts[0]} ${lastParts[0]}`, 0.8, "Primer nombre + primer apellido");
  }

  if (lastParts.length > 1) {
    addVariant(`${firstParts[0]} ${lastParts[lastParts.length - 1]}`, 0.75, "Primer nombre + último apellido");
    if (firstParts.length > 1) {
      addVariant(`${firstParts[0]} ${firstParts[1]} ${lastParts[lastParts.length - 1]}`, 0.8, "Nombres + último apellido");
    }
  }

  for (const fp of firstParts) {
    for (const lp of lastParts) {
      addVariant(`${fp} ${lp}`, 0.65, `${fp} + ${lp}`);
    }
  }

  for (let i = 0; i < allParts.length - 1; i++) {
    addVariant(`${allParts[i]} ${allParts[i + 1]}`, 0.5, "Par consecutivo");
  }

  for (let i = 0; i < allParts.length - 2; i++) {
    addVariant(`${allParts[i]} ${allParts[i + 1]} ${allParts[i + 2]}`, 0.7, "Triplete consecutivo");
  }

  for (const lp of lastParts) {
    if (lp.length >= 5) {
      addVariant(lp, 0.3, `Apellido individual: ${lp}`);
    }
  }

  variants.sort((a, b) => b.strength - a.strength);
  return variants;
}

/**
 * Score how well a piece of candidate text (a social media username,
 * display name, or page title) matches a person's name. Used to catch
 * false-positive matches — e.g. `site:instagram.com "Lionel Messi"` can
 * return a news outlet's own Instagram account just because their article
 * mentions the name, not the person's actual profile.
 *
 * Returns 0 (no resemblance) to 1 (matches the strongest name variant).
 */
export function computeNameMatchScore(
  candidateText: string,
  firstName: string,
  lastName: string
): number {
  if (!candidateText || !firstName || !lastName) return 0;

  const candidateNormalized = normalizeText(candidateText);
  const candidateSmushed = candidateNormalized.replace(/[\s._-]/g, "");
  if (!candidateSmushed) return 0;

  const candidateWords = new Set(
    candidateNormalized.split(/[\s._-]+/).filter(Boolean)
  );

  let best = 0;
  for (const variant of generateNameVariants(firstName, lastName)) {
    const variantSmushed = variant.normalized.replace(/\s/g, "");
    if (!variantSmushed) continue;

    let score = 0;
    if (candidateSmushed === variantSmushed) {
      score = variant.strength;
    } else if (
      candidateSmushed.includes(variantSmushed) ||
      variantSmushed.includes(candidateSmushed)
    ) {
      score = variant.strength * 0.75;
    } else {
      const variantTokens = variant.normalized.split(/\s+/).filter(Boolean);
      if (
        variantTokens.length > 0 &&
        variantTokens.every((t) => candidateWords.has(t))
      ) {
        score = variant.strength * 0.6;
      }
    }

    if (score > best) best = score;
  }

  return Math.min(1, best);
}

// ─────────────────────────────────────────────────────────────
// EMAIL NORMALIZATION
// ─────────────────────────────────────────────────────────────

/**
 * Normalize an email: lowercase, strip aliases (+tag), trim.
 * e.g. Juan.Perez+newsletter@acme.com → juan.perez@acme.com
 */
export function normalizeEmail(email: string): string {
  if (!email) return "";
  const lower = email.toLowerCase().trim();
  const [local, domain] = lower.split("@");
  if (!domain) return lower;
  const cleanLocal = local.split("+")[0];
  return `${cleanLocal}@${domain}`;
}

/** Extract the domain from an email address */
export function emailDomain(email: string): string {
  const parts = email.split("@");
  return parts.length > 1 ? parts[1].toLowerCase() : "";
}

/** Check if an email domain is a free provider (not corporate) */
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "yahoo.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "protonmail.com",
  "proton.me",
  "yandex.com",
]);

export function isCorporateEmail(email: string): boolean {
  const domain = emailDomain(email);
  return domain !== "" && !FREE_EMAIL_DOMAINS.has(domain);
}

// ─────────────────────────────────────────────────────────────
// COMPANY NAME NORMALIZATION
// ─────────────────────────────────────────────────────────────

/** Normalize a company name for matching */
export function normalizeCompanyName(name: string): string {
  if (!name) return "";
  return normalizeText(name)
    .replace(/\b(sa|srl|sas|spa|ltda|inc|llc|corp|corporation|group|holding)\b\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Generic company names that should be ignored in matching */
const GENERIC_COMPANIES = new Set([
  "independiente",
  "empresa privada",
  "sin empresa",
  "no registrada",
  "empresa",
  "autonomo",
  "freelance",
]);

export function isGenericCompany(name: string): boolean {
  return GENERIC_COMPANIES.has(normalizeCompanyName(name));
}

// ─────────────────────────────────────────────────────────────
// AUTHENTICITY MATCHING (identity signal cross-checking)
// ─────────────────────────────────────────────────────────────

export interface AuthenticityMatch {
  score: number;
  nameMatchStrength: number;
  phoneMatched: boolean;
  emailMatched: boolean;
  locationMatched: boolean;
  companyMatched: boolean;
  matchedVariants: string[];
}

/**
 * Check how well a text matches a person's identity signals.
 * Uses pre-computed name + phone variants for efficiency.
 */
export function computeAuthenticity(
  text: string,
  signals: {
    email?: string;
    locality?: string;
    company?: string;
  },
  nameVariants: NameVariant[],
  phoneDigitPatterns: string[]
): AuthenticityMatch {
  const normText = normalizeText(text);
  const rawDigits = text.replace(/\D/g, "");

  let score = 0;
  let nameMatchStrength = 0;
  const matchedVariants: string[] = [];

  // Name matching
  for (const variant of nameVariants) {
    if (normText.includes(variant.normalized)) {
      if (variant.strength > nameMatchStrength) {
        nameMatchStrength = variant.strength;
      }
      matchedVariants.push(`Nombre: "${variant.value}" (${Math.round(variant.strength * 100)}%)`);
      break;
    }
  }
  score += Math.round(nameMatchStrength * 40);

  // Phone matching
  let phoneMatched = false;
  for (const pattern of phoneDigitPatterns) {
    if (rawDigits.includes(pattern)) {
      phoneMatched = true;
      matchedVariants.push(`Teléfono: ${pattern}`);
      score += 25;
      break;
    }
  }

  // Email matching
  let emailMatched = false;
  if (signals.email) {
    const normEmail = normalizeText(signals.email);
    if (normText.includes(normEmail)) {
      emailMatched = true;
      matchedVariants.push(`Email: ${signals.email}`);
      score += 20;
    }
  }

  // Location matching
  let locationMatched = false;
  if (signals.locality) {
    const locationParts = signals.locality
      .split(/[,;]/)
      .map((p) => normalizeText(p))
      .filter((p) => p.length > 3);
    for (const part of locationParts) {
      if (normText.includes(part)) {
        locationMatched = true;
        matchedVariants.push(`Ubicación: ${part}`);
        score += 10;
        break;
      }
    }
  }

  // Company matching
  let companyMatched = false;
  if (signals.company && !isGenericCompany(signals.company)) {
    const normCompany = normalizeCompanyName(signals.company);
    if (normCompany.length > 3 && normText.includes(normCompany)) {
      companyMatched = true;
      matchedVariants.push(`Empresa: ${signals.company}`);
      score += 15;
    }
  }

  return {
    score: Math.min(100, score),
    nameMatchStrength,
    phoneMatched,
    emailMatched,
    locationMatched,
    companyMatched,
    matchedVariants,
  };
}

// ─────────────────────────────────────────────────────────────
// ARGENTINE REGIONS (shared between rule-based-reasoner.ts and
// notes-signals.ts — was previously duplicated in the former only)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// RESERVED SOCIAL PATH SEGMENTS (shared between social-agent.ts and
// website-agent.ts — was previously only checked by the former's own
// site: search results, not by the latter's regex link-scraping of
// arbitrary fetched pages, letting e.g. "instagram.com/explore/..." or
// "facebook.com/groups/..." through as if they were profile URLs)
// ─────────────────────────────────────────────────────────────

export const RESERVED_SOCIAL_PATH_SEGMENTS: Record<string, string[]> = {
  instagram: ["reel", "reels", "p", "tv", "stories", "explore", "accounts", "direct"],
  facebook: ["groups", "watch", "marketplace", "events", "pages", "help", "policies", "ads", "business", "photo"],
};

export const ARGENTINE_REGIONS = [
  "ciudad autonoma de buenos aires", "caba", "buenos aires", "catamarca", "chaco",
  "chubut", "cordoba", "corrientes", "entre rios", "formosa", "jujuy", "la pampa",
  "la rioja", "mendoza", "misiones", "neuquen", "rio negro", "salta", "san juan",
  "san luis", "santa cruz", "santa fe", "santiago del estero", "tierra del fuego",
  "tucuman",
];

// ─────────────────────────────────────────────────────────────
// NAME PROXIMITY (relevance gate — is this text really about the
// target, or does it just happen to contain both name parts
// somewhere unrelated?)
// ─────────────────────────────────────────────────────────────

/**
 * Checks whether firstName and lastName appear within maxWordDistance
 * words of each other in text, instead of merely somewhere in the same
 * (possibly huge) document. A generic "both words present" check lets
 * totally unrelated pages through — e.g. a Flickr photo caption that
 * happens to contain "Inti" (a common Andean given name/word) and
 * "Quiroga" (a common Argentine surname) in unrelated sentences — which
 * previously caused search-agent.ts and website-agent.ts to treat that
 * page as being about the lead and extract garbage "evidence" from it
 * (fake phone numbers pulled from a photo ID in the URL, in one observed
 * case). Requiring proximity is a cheap, effective filter for this
 * without needing a full NLP entity-linking pass.
 */
export function namesAppearNearby(
  text: string,
  firstName: string,
  lastName: string,
  maxWordDistance: number = 6,
): boolean {
  if (!text || !firstName || !lastName) return false;

  const words = normalizeText(text).split(/\s+/).filter(Boolean);
  const firstNormalized = normalizeText(firstName.trim().split(/\s+/)[0] ?? firstName);
  const lastParts = new Set(
    lastName.trim().split(/\s+/).filter(Boolean).map((p) => normalizeText(p)),
  );

  const firstPositions: number[] = [];
  const lastPositions: number[] = [];
  words.forEach((word, i) => {
    if (word === firstNormalized) firstPositions.push(i);
    if (lastParts.has(word)) lastPositions.push(i);
  });

  if (firstPositions.length === 0 || lastPositions.length === 0) return false;

  for (const fp of firstPositions) {
    for (const lp of lastPositions) {
      if (Math.abs(fp - lp) <= maxWordDistance) return true;
    }
  }
  return false;
}
