// ============================================================
// OSINT Platform — News → Sales Conclusions
// ============================================================
// news-agent.ts already classifies every news item into a
// NewsCategory (expansion, investment, hiring, award, event,
// public_tender, ...) via categorizeNews(), but that category
// was only ever used as raw text fed into income-level keyword
// matching — it never became an actual conclusion a salesperson
// could act on. This turns that existing classification into
// one plain-language, actionable sentence per category found,
// instead of just listing "N news items found".
// ============================================================

import type { GraphEntity, NewsCategory } from "../types";
import { normalizeText } from "./normalization";

interface CategorizedText {
  category: NewsCategory;
  text: string;
}

function collectCategorizedNews(newsItems: GraphEntity[]): CategorizedText[] {
  return newsItems.map((entity) => {
    const props = entity.properties as any;
    const category = (props.category as NewsCategory) ?? "public_mention";
    const text = normalizeText(`${props.title ?? ""} ${props.snippet ?? ""}`);
    return { category, text };
  });
}

/**
 * Turns categorized news items (person + company) into deduplicated,
 * actionable sales conclusions in Spanish — e.g. "Está contratando
 * vendedores" instead of "3 news items in category hiring".
 */
export function buildNewsConclusions(newsItems: GraphEntity[]): string[] {
  const items = collectCategorizedNews(newsItems);
  const byCategory = new Map<NewsCategory, CategorizedText[]>();
  for (const item of items) {
    const bucket = byCategory.get(item.category) ?? [];
    bucket.push(item);
    byCategory.set(item.category, bucket);
  }

  const conclusions: string[] = [];

  const expansion = byCategory.get("expansion");
  if (expansion?.length) {
    const combined = expansion.map((e) => e.text).join(" ");
    conclusions.push(
      /sucursal|nueva sede|apertura/.test(combined)
        ? "Abrió una nueva sucursal o sede — señal de expansión activa, buen momento para ofrecer más espacio o una segunda propiedad."
        : "Empresa o perfil en expansión / crecimiento reciente — posible oportunidad para escalar la propuesta."
    );
  }

  const investment = byCategory.get("investment");
  if (investment?.length) {
    conclusions.push(
      "Recibió una inversión o ronda de capital reciente — mayor poder adquisitivo probable en el corto plazo."
    );
  }

  const hiring = byCategory.get("hiring");
  if (hiring?.length) {
    const combined = hiring.map((e) => e.text).join(" ");
    conclusions.push(
      /vendedor|comercial|ventas/.test(combined)
        ? "Está contratando vendedores o personal comercial — equipo en crecimiento, buen momento para acercarse."
        : "Está contratando personal — señal de expansión del equipo."
    );
  }

  const award = byCategory.get("award");
  if (award?.length) {
    conclusions.push(
      "Reconocimiento o premio reciente en su sector — buen momento para un abordaje que capitalice el momentum."
    );
  }

  const event = byCategory.get("event");
  if (event?.length) {
    conclusions.push(
      "Participación reciente en eventos o ferias del sector — probablemente activo y con buena visibilidad pública."
    );
  }

  const publicTender = byCategory.get("public_tender");
  if (publicTender?.length) {
    conclusions.push(
      "Participa en licitaciones públicas — empresa con actividad institucional relevante."
    );
  }

  return conclusions;
}
