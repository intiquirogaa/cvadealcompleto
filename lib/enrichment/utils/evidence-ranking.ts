import type { SearchResult, ClientInput, EnrichedDatum } from '../types';
import {
  generateNameVariants,
  getPhoneDigitPatterns,
  computeAuthenticity,
} from './variant-generator';

/** Normaliza un string removiendo acentos, caracteres especiales y llevándolo a minúsculas */
export function normalizeText(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s@\.]/gi, '')
    .trim();
}

/** Limpia el texto basura de los snippets */
export function sanitizeSnippet(snippet: string): string {
  if (!snippet) return '';
  return snippet
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcula un score de confianza (0-100) para un dato específico.
 * Ahora usa el algoritmo de autenticidad basado en variantes.
 */
export function scoreDataPoint<T>(
  value: T,
  sourceUrl: string,
  client: ClientInput,
  contextResults: SearchResult[],
  baseConfidence: number = 50
): EnrichedDatum<T> {
  let confidence = baseConfidence;
  
  const urlLower = sourceUrl.toLowerCase();
  
  let hostname = 'unknown';
  try {
    hostname = new URL(sourceUrl).hostname.replace('www.', '');
  } catch {
    hostname = sourceUrl;
  }

  // Autoridad de la fuente
  if (urlLower.includes('linkedin.com')) confidence += 25;
  if (urlLower.includes('bloomberg.com') || urlLower.includes('forbes.com')) confidence += 20;
  if (urlLower.includes('instagram.com') || urlLower.includes('facebook.com')) confidence += 10;
  
  // Si coincide el dominio del email de la empresa
  if (client.email && client.email.includes('@')) {
    const domain = client.email.split('@')[1];
    if (urlLower.includes(domain)) confidence += 30;
  }

  // Authenticity-based scoring using variant matching
  const nameVariants = generateNameVariants(client.firstName, client.lastName);
  const phonePatterns = getPhoneDigitPatterns(client.phone);

  // Check how many evidence items contain the same value + identity signals
  if (typeof value === 'string') {
    const normValue = normalizeText(value);
    if (normValue.length > 3) {
      let authenticOccurrences = 0;
      
      for (const res of contextResults) {
        const text = `${res.title} ${res.snippet}`;
        const normText = normalizeText(text);
        
        if (normText.includes(normValue)) {
          // Check if this result also matches the client identity
          const auth = computeAuthenticity(text, client, nameVariants, phonePatterns);
          if (auth.score >= 20) {
            authenticOccurrences++;
          }
        }
      }

      // Up to 25 points for authentic frequency
      confidence += Math.min(25, authenticOccurrences * 8);
    }
  }

  // Cap at 100
  confidence = Math.min(100, Math.max(0, confidence));

  return {
    value,
    confidence,
    source: hostname,
    sourceUrl,
    lastVerified: new Date().toISOString()
  };
}
