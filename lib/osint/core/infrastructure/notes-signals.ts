// ============================================================
// OSINT Platform — CRM Notes → Search Signals
// ============================================================
// The CRM already collects free-text notes about a lead (ClientNote,
// CRMClient.notes/nextContactNote/conversationText) that often contain
// exactly the kind of disambiguating detail a generic name search can't
// find on its own — e.g. "está por mudarse a Mendoza" tells us to also
// search for the lead in a city they don't live in yet. None of that
// text ever reached the OSINT pipeline before; this extracts the two
// signals worth acting on automatically (a mentioned locality, and
// whether it's tied to an active moving/buying intent) without a full
// NLP pass, in the same keyword-matching style as rule-based-reasoner.ts.
// ============================================================

import { normalizeText, ARGENTINE_REGIONS } from "./normalization";

export interface NotesSignals {
  /** A locality mentioned in the notes, distinct from whatever's already in CRMClient.locality. */
  mentionedLocality: string | null;
  /** Plain-language, sales-facing observations to surface alongside the AI/rule-based insights. */
  observations: string[];
}

const MOVING_KEYWORDS = [
  "se muda", "esta por mudarse", "va a mudarse", "busca mudarse",
  "se traslada", "se va a vivir", "cambia de ciudad", "se muda a",
];

const BUYING_INTENT_KEYWORDS = [
  "quiere comprar", "busca comprar", "interesado en comprar",
  "quiere invertir", "busca invertir",
];

export function extractNotesSignals(notes: string | undefined | null): NotesSignals {
  if (!notes || !notes.trim()) {
    return { mentionedLocality: null, observations: [] };
  }

  const text = normalizeText(notes);
  const observations: string[] = [];

  const mentionedLocality = ARGENTINE_REGIONS.find((region) => text.includes(region)) ?? null;
  const hasMovingIntent = MOVING_KEYWORDS.some((k) => text.includes(k));
  const hasBuyingIntent = BUYING_INTENT_KEYWORDS.some((k) => text.includes(k));

  if (hasMovingIntent && mentionedLocality) {
    observations.push(
      `Las notas indican que el cliente está por mudarse a ${mentionedLocality} — usar esta ubicación para afinar la búsqueda y priorizar propuestas ahí.`
    );
  } else if (hasMovingIntent) {
    observations.push(
      "Las notas indican que el cliente está por mudarse, pero no se detectó el destino — confirmar para afinar la búsqueda."
    );
  } else if (mentionedLocality) {
    observations.push(`Las notas mencionan una ubicación adicional: ${mentionedLocality}.`);
  }

  if (hasBuyingIntent) {
    observations.push("Las notas indican intención activa de compra/inversión — priorizar seguimiento.");
  }

  return { mentionedLocality, observations };
}
