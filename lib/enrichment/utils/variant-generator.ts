// ============================================================
// OSINT Enrichment Pipeline — Variant Generator
// ============================================================
// Genera todas las variantes posibles de teléfono y nombre
// para maximizar la detección en resultados de búsqueda.
// ============================================================

import { normalizeText } from './evidence-ranking';

// ─────────────────────────────────────────────────────────────
// PHONE VARIANTS
// ─────────────────────────────────────────────────────────────

export interface PhoneVariant {
  /** The raw variant string (digits only or formatted) */
  value: string;
  /** Digits-only version for matching inside text */
  digits: string;
  /** Human-readable label */
  label: string;
}

/**
 * Given a phone number like +5492804823370, generates ALL possible
 * display/search variants:
 *   - Full international: 5492804823370
 *   - Without country code: 2804823370
 *   - With separators: 2804-823370, 2804 823370
 *   - Argentine mobile format: 02804-15-823370
 *   - Local subscriber: 823370
 *   - And many more...
 */
export function generatePhoneVariants(phone?: string): PhoneVariant[] {
  if (!phone) return [];

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return [];

  const variants: PhoneVariant[] = [];
  const seen = new Set<string>();

  const add = (value: string, label: string) => {
    const d = value.replace(/\D/g, '');
    if (d.length < 6) return;
    if (seen.has(d)) return;
    seen.add(d);
    variants.push({ value, digits: d, label });
  };

  // Original
  add(phone, 'Original');
  add(digits, 'Solo dígitos');

  // Strip Argentina prefix layers
  let withoutCountry = digits;
  if (digits.startsWith('54')) {
    withoutCountry = digits.slice(2);
    add('54' + withoutCountry, 'Con código país');
    add('+54' + withoutCountry, 'Con +54');
  }

  let withoutMobile = withoutCountry;
  if (withoutCountry.startsWith('9')) {
    withoutMobile = withoutCountry.slice(1);
    add('549' + withoutMobile, 'Internacional móvil');
    add('+549' + withoutMobile, 'Con +549');
  }

  let national = withoutMobile;
  if (national.startsWith('0')) {
    national = national.slice(1);
  }
  add(national, 'Nacional');

  // Now generate formatted variants from the national number
  // Argentine numbers: area code (2-4 digits) + subscriber (6-8 digits)
  // Common patterns: 2804-823370, 280-4823370, etc.
  if (national.length >= 10) {
    // Try area codes of length 2, 3, 4
    for (const areaLen of [2, 3, 4]) {
      if (areaLen >= national.length) continue;
      const area = national.slice(0, areaLen);
      const subscriber = national.slice(areaLen);

      // With dash
      add(`${area}-${subscriber}`, `Área ${area} con guión`);
      // With space
      add(`${area} ${subscriber}`, `Área ${area} con espacio`);
      // With 0 prefix (landline style)
      add(`0${area}-${subscriber}`, `0${area} con guión`);
      add(`0${area} ${subscriber}`, `0${area} con espacio`);

      // Argentine mobile: 0+area+15+subscriber (last 8 or 7 digits)
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

      // Split subscriber further (e.g. 823-370, 82-3370)
      if (subscriber.length >= 6) {
        const mid = Math.ceil(subscriber.length / 2);
        const part1 = subscriber.slice(0, mid);
        const part2 = subscriber.slice(mid);
        add(`${area}-${part1}-${part2}`, `Área ${area} triple segmento`);
        add(`${area} ${part1} ${part2}`, `Área ${area} triple espacio`);
      }
    }
  }

  // Also just the last 7 and 8 digits (subscriber number)
  if (national.length > 8) {
    add(national.slice(-8), 'Últimos 8 dígitos');
    add(national.slice(-7), 'Últimos 7 dígitos');
  }

  return variants;
}

/**
 * Returns only the digit-strings for fast matching inside text blobs.
 */
export function getPhoneDigitPatterns(phone?: string): string[] {
  return generatePhoneVariants(phone)
    .map(v => v.digits)
    .filter(d => d.length >= 7)
    .sort((a, b) => b.length - a.length); // longest first for greedy matching
}

// ─────────────────────────────────────────────────────────────
// NAME VARIANTS
// ─────────────────────────────────────────────────────────────

export interface NameVariant {
  /** The combined name string */
  value: string;
  /** Normalized (lowercase, no accents) */
  normalized: string;
  /** How "complete" this variant is (1.0 = full name, lower = partial) */
  strength: number;
  /** Human-readable description */
  label: string;
}

/**
 * Given a full name like "Inti Uriel Pichipillan Quiroga",
 * generates all meaningful combinations:
 *   - Inti Uriel Pichipillan Quiroga (full)
 *   - Inti Pichipillan Quiroga
 *   - Inti Uriel Quiroga
 *   - Inti Quiroga
 *   - Inti Pichipillan
 *   - Inti Uriel
 *   - Uriel Pichipillan
 *   - etc.
 *
 * Assigns a "strength" score based on completeness.
 */
export function generateNameVariants(firstName: string, lastName: string): NameVariant[] {
  const variants: NameVariant[] = [];
  const seen = new Set<string>();

  const addVariant = (value: string, strength: number, label: string) => {
    const normalized = normalizeText(value);
    if (normalized.length < 3) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    variants.push({ value, normalized, strength, label });
  };

  // Split into individual tokens
  const firstParts = firstName.trim().split(/\s+/).filter(Boolean);
  const lastParts = lastName.trim().split(/\s+/).filter(Boolean);
  const allParts = [...firstParts, ...lastParts];

  // Full name (highest strength)
  addVariant(`${firstName} ${lastName}`, 1.0, 'Nombre completo');

  // First name + all last names
  if (firstParts.length > 1) {
    addVariant(`${firstParts[0]} ${lastName}`, 0.9, 'Primer nombre + apellido completo');
  }

  // All first names + first last name
  if (lastParts.length > 1) {
    addVariant(`${firstName} ${lastParts[0]}`, 0.85, 'Nombre completo + primer apellido');
  }

  // First name only + first last name only
  if (firstParts.length > 1 || lastParts.length > 1) {
    addVariant(`${firstParts[0]} ${lastParts[0]}`, 0.8, 'Primer nombre + primer apellido');
  }

  // First name + second last name (e.g. "Inti Quiroga")
  if (lastParts.length > 1) {
    addVariant(`${firstParts[0]} ${lastParts[lastParts.length - 1]}`, 0.75, 'Primer nombre + último apellido');
    if (firstParts.length > 1) {
      addVariant(`${firstParts[0]} ${firstParts[1]} ${lastParts[lastParts.length - 1]}`, 0.8, 'Nombres + último apellido');
    }
  }

  // Combinations of each first name with each last name
  for (const fp of firstParts) {
    for (const lp of lastParts) {
      addVariant(`${fp} ${lp}`, 0.65, `${fp} + ${lp}`);
    }
  }

  // Consecutive pairs (e.g. "Uriel Pichipillan")
  for (let i = 0; i < allParts.length - 1; i++) {
    addVariant(`${allParts[i]} ${allParts[i + 1]}`, 0.5, `Par consecutivo`);
  }

  // Triplets from all parts
  for (let i = 0; i < allParts.length - 2; i++) {
    addVariant(`${allParts[i]} ${allParts[i + 1]} ${allParts[i + 2]}`, 0.7, 'Triplete consecutivo');
  }

  // Individual last names (useful for rare surnames)
  for (const lp of lastParts) {
    if (lp.length >= 5) {
      addVariant(lp, 0.3, `Apellido individual: ${lp}`);
    }
  }

  // Sort by strength descending
  variants.sort((a, b) => b.strength - a.strength);

  return variants;
}

/**
 * Checks how well a text matches the client's identity.
 * Returns a score 0-100 and which signals matched.
 */
export interface AuthenticityMatch {
  score: number;
  nameMatchStrength: number;
  phoneMatched: boolean;
  emailMatched: boolean;
  locationMatched: boolean;
  companyMatched: boolean;
  matchedVariants: string[];
}

export function computeAuthenticity(
  text: string,
  client: ClientInput,
  nameVariants: NameVariant[],
  phoneDigitPatterns: string[]
): AuthenticityMatch {
  const normText = normalizeText(text);
  const rawDigits = text.replace(/\D/g, '');

  let score = 0;
  let nameMatchStrength = 0;
  const matchedVariants: string[] = [];

  // ── Name matching ──
  for (const variant of nameVariants) {
    if (normText.includes(variant.normalized)) {
      if (variant.strength > nameMatchStrength) {
        nameMatchStrength = variant.strength;
      }
      matchedVariants.push(`Nombre: "${variant.value}" (${Math.round(variant.strength * 100)}%)`);
      break; // Take best match only
    }
  }
  score += Math.round(nameMatchStrength * 40); // Max 40 points

  // ── Phone matching ──
  let phoneMatched = false;
  for (const pattern of phoneDigitPatterns) {
    if (rawDigits.includes(pattern)) {
      phoneMatched = true;
      matchedVariants.push(`Teléfono: ${pattern}`);
      score += 25;
      break;
    }
  }

  // ── Email matching ──
  let emailMatched = false;
  if (client.email) {
    const normEmail = normalizeText(client.email);
    if (normText.includes(normEmail)) {
      emailMatched = true;
      matchedVariants.push(`Email: ${client.email}`);
      score += 20;
    }
  }

  // ── Location matching ──
  let locationMatched = false;
  if (client.locality) {
    const locationParts = client.locality
      .split(/[,;]/)
      .map(p => normalizeText(p))
      .filter(p => p.length > 3);
    for (const part of locationParts) {
      if (normText.includes(part)) {
        locationMatched = true;
        matchedVariants.push(`Ubicación: ${part}`);
        score += 10;
        break;
      }
    }
  }

  // ── Company matching ──
  let companyMatched = false;
  if (client.company) {
    const genericCompanies = ['independiente', 'empresa privada', 'sin empresa', 'no registrada', 'empresa'];
    const normCompany = normalizeText(client.company);
    if (normCompany.length > 3 && !genericCompanies.includes(normCompany)) {
      if (normText.includes(normCompany)) {
        companyMatched = true;
        matchedVariants.push(`Empresa: ${client.company}`);
        score += 15;
      }
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
// QUERY GENERATION HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Generates optimized search queries from name and phone variants.
 * Instead of brute-forcing every combination, picks the most
 * strategically useful ones.
 */
export function generateSmartQueries(
  client: ClientInput,
  nameVariants: NameVariant[],
  phoneVariants: PhoneVariant[]
): string[] {
  const queries = new Set<string>();

  // Top 5 strongest name variants as exact-match queries
  const topNames = nameVariants.filter(v => v.strength >= 0.65).slice(0, 5);
  for (const nv of topNames) {
    queries.add(`"${nv.value}"`);
  }

  // Top 4 phone variants
  const topPhones = phoneVariants.slice(0, 4);
  for (const pv of topPhones) {
    queries.add(`"${pv.value}"`);
  }

  // Cross: best name + phone
  if (topNames.length > 0 && topPhones.length > 0) {
    queries.add(`"${topNames[0].value}" "${topPhones[0].value}"`);
  }

  // Name + location
  if (client.locality) {
    const loc = client.locality.split(',')[0].trim();
    for (const nv of topNames.slice(0, 2)) {
      queries.add(`"${nv.value}" ${loc}`);
    }
    // Phone + location
    for (const pv of topPhones.slice(0, 2)) {
      queries.add(`"${pv.value}" ${loc}`);
    }
  }

  // Name + company
  if (client.company) {
    const genericCompanies = ['independiente', 'empresa privada', 'sin empresa', 'no registrada', 'empresa'];
    if (!genericCompanies.includes(client.company.toLowerCase())) {
      queries.add(`"${topNames[0]?.value || client.firstName + ' ' + client.lastName}" "${client.company}"`);
    }
  }

  // Name + profession
  if (client.profession) {
    queries.add(`"${topNames[0]?.value || client.firstName + ' ' + client.lastName}" ${client.profession}`);
  }

  // Email
  if (client.email) {
    queries.add(`"${client.email}"`);
  }

  return Array.from(queries);
}

// Re-export for convenience
import type { ClientInput } from '../types';
