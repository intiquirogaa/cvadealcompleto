import type { ClientInput } from "./types";
import {
  generateNameVariants,
  generatePhoneVariants,
  generateSmartQueries,
} from "./utils/variant-generator";

/**
 * Genera el lote inicial de búsquedas usando el algoritmo de variantes.
 * Combina las búsquedas inteligentes del variant-generator con búsquedas
 * específicas para sitios profesionales y redes sociales.
 */
export function generateInitialQueries(client: ClientInput): string[] {
  const queries = new Set<string>();

  const nameVariants = generateNameVariants(client.firstName, client.lastName);
  const phoneVariants = generatePhoneVariants(client.phone);

  // Smart queries from variant generator (names x phones x context)
  const smartQueries = generateSmartQueries(client, nameVariants, phoneVariants);
  for (const q of smartQueries) {
    queries.add(q);
  }

  // ==========================================
  // PROFESSIONAL SITES
  // ==========================================
  const name = `${client.firstName} ${client.lastName}`;
  const strictName = `"${name}"`;
  const emailDomain = client.email?.split("@")[1];
  const locality = client.locality?.replace(/[,;]/g, "").trim() || "";

  const professionalSites = [
    "linkedin.com/in",
    "about.me",
    "github.com",
  ];
  for (const site of professionalSites) {
    queries.add(`site:${site} ${strictName}`);
  }

  // Directory / professional registry
  if (client.profession) {
    queries.add(`${strictName} colegio de ${client.profession}`);
    queries.add(`${name} ${client.profession}`);
  }

  // ==========================================
  // SOCIAL SITES  
  // ==========================================
  const socialSites = [
    "instagram.com",
    "facebook.com",
    "x.com",
    "twitter.com",
  ];
  for (const site of socialSites) {
    queries.add(`site:${site} ${strictName}`);
  }

  // ==========================================
  // PHONE-SPECIFIC SEARCHES (using top variants)
  // ==========================================
  const topPhoneValues = phoneVariants.slice(0, 4).map(v => v.value);
  const phoneSearchSites = [
    "facebook.com",
    "mercadolibre.com.ar",
    "cuitonline.com",
  ];

  for (const phone of topPhoneValues.slice(0, 3)) {
    queries.add(`"${phone}" whatsapp`);
    queries.add(`"${phone}" contacto OR venta`);
  }

  for (const phone of topPhoneValues.slice(0, 1)) {
    for (const site of phoneSearchSites) {
      queries.add(`site:${site} "${phone}"`);
    }
  }

  if (phoneVariants.length > 0) {
    queries.add(`${name} telefono`);
    queries.add(`${name} whatsapp`);
  }

  // ==========================================
  // DOMAIN SEARCH
  // ==========================================
  if (
    emailDomain &&
    !["gmail.com", "hotmail.com", "yahoo.com", "outlook.com"].includes(emailDomain)
  ) {
    queries.add(emailDomain);
    queries.add(`site:${emailDomain} ${name}`);
    queries.add(`site:linkedin.com/company ${emailDomain}`);
  }

  console.log(`[Planner] Generated ${queries.size} initial queries from ${nameVariants.length} name variants and ${phoneVariants.length} phone variants`);

  return Array.from(queries);
}

/**
 * Genera consultas recursivas si se encontraron nuevas entidades (ej. nombre de empresa)
 */
export function generateRecursiveQueries(
  client: ClientInput,
  discoveredCompany?: string,
  discoveredDomain?: string
): string[] {
  const queries = new Set<string>();

  if (discoveredCompany) {
    queries.add(`site:linkedin.com/company "${discoveredCompany}"`);
    queries.add(`"${discoveredCompany}" noticias`);
    queries.add(`"${discoveredCompany}" inversiones`);
  }

  if (discoveredDomain && !discoveredDomain.includes("gmail.com")) {
    queries.add(`site:${discoveredDomain} nosotros OR equipo`);
  }

  return Array.from(queries);
}
