// ============================================================
// OSINT Platform — Social Profiles → Sales Conclusions
// ============================================================
// apify-social.provider.ts pulls real page data (bio, followers,
// verified, business account, public contact info) for Instagram/
// Facebook profiles, but until now that data only ever fed the
// entity's own properties — neither reasoner (ai-reasoner.ts,
// rule-based-reasoner.ts) read past `platform` when building
// insights, so bio/followers/verified were collected and then
// silently discarded. This turns that raw data into deduplicated,
// actionable sentences, the same way news-conclusions.ts does for
// categorized news.
// ============================================================

import type { GraphEntity, SocialProfileProperties } from "../types";
import { normalizeText } from "./normalization";

export interface SocialConclusions {
  /** Actionable, sales-facing observations — same bucket as buildNewsConclusions(). */
  opportunities: string[];
  /** Things a salesperson should double check or treat cautiously. */
  alerts: string[];
  /** Short interest/lifestyle signals inferred from bio text. */
  interests: string[];
}

const MIN_NOTABLE_FOLLOWERS = 10_000;
const STALE_ACTIVITY_DAYS = 180;

const FAMILY_KEYWORDS = ["esposa", "esposo", "hijos", "hija", "hijo", "papa de", "mama de", "familia"];
const REAL_ESTATE_INTEREST_KEYWORDS = ["inversor", "bienes raices", "propiedades", "inmobiliaria", "real estate"];
const TRAVEL_KEYWORDS = ["viajero", "viajes", "travel", "nomada digital"];

function daysSince(dateStr: string): number | null {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Turns SocialProfileProperties (as enriched by apify-social.provider.ts)
 * into deduplicated, actionable sales conclusions in Spanish. Profiles
 * without any Apify enrichment (bio/followers all undefined) contribute
 * nothing here — they still just count toward "N perfiles encontrados"
 * in the reasoner's summary.
 */
export function buildSocialConclusions(socialProfiles: GraphEntity[]): SocialConclusions {
  const opportunities: string[] = [];
  const alerts: string[] = [];
  const interests: string[] = [];

  for (const entity of socialProfiles) {
    const p = entity.properties as SocialProfileProperties;
    const platformLabel = p.platform.charAt(0).toUpperCase() + p.platform.slice(1);

    if (p.verified) {
      opportunities.push(
        `Cuenta de ${platformLabel} verificada — indica una figura pública o con presencia mediática relevante; cuidar el tono profesional en el abordaje.`
      );
    }

    if (typeof p.followers === "number" && p.followers >= MIN_NOTABLE_FOLLOWERS) {
      opportunities.push(
        `Alcance social relevante en ${platformLabel}: ~${p.followers.toLocaleString("es-AR")} seguidores — posible influencer o figura pública, con mayor poder adquisitivo probable y potencial de referidos.`
      );
    }

    if (p.isBusinessAccount && p.businessCategory) {
      opportunities.push(
        `Cuenta de ${platformLabel} de tipo negocio, categoría "${p.businessCategory}" — señal directa de actividad comercial/profesional en ese rubro.`
      );
    }

    if (p.publicEmail || p.publicPhoneNumber) {
      const channels = [p.publicEmail ? "email" : null, p.publicPhoneNumber ? "teléfono" : null]
        .filter(Boolean)
        .join(" y ");
      alerts.push(
        `Canal de contacto público detectado en ${platformLabel} (${channels}) — considerar como vía alternativa si el contacto principal no responde.`
      );
    }

    if (p.externalUrl) {
      opportunities.push(
        `El perfil de ${platformLabel} linkea a ${p.externalUrl} — revisar, suele ser un emprendimiento o sitio propio no detectado por otras fuentes.`
      );
    }

    if (p.lastActivityAt) {
      const days = daysSince(p.lastActivityAt);
      if (days !== null && days > STALE_ACTIVITY_DAYS) {
        alerts.push(
          `${platformLabel} sin actividad hace más de ${Math.floor(days / 30)} meses — posible cuenta abandonada, la info del perfil podría estar desactualizada.`
        );
      }
    }

    if (p.city) {
      alerts.push(`Ciudad detectada vía ${platformLabel}: ${p.city}. Confirmar con el lead.`);
    }

    if (p.bio) {
      const bioText = normalizeText(p.bio);
      if (FAMILY_KEYWORDS.some((k) => bioText.includes(k))) {
        interests.push(`Menciona familia en su bio de ${platformLabel} — posible necesidad de vivienda familiar (más dormitorios/espacio).`);
      }
      if (REAL_ESTATE_INTEREST_KEYWORDS.some((k) => bioText.includes(k))) {
        interests.push(`Bio de ${platformLabel} sugiere interés o actividad en bienes raíces — posible comprador informado o inversor.`);
      }
      if (TRAVEL_KEYWORDS.some((k) => bioText.includes(k))) {
        interests.push(`Bio de ${platformLabel} sugiere estilo de vida viajero — podría valorar propiedades con potencial de renta/Airbnb.`);
      }
    }
  }

  return {
    opportunities: Array.from(new Set(opportunities)),
    alerts: Array.from(new Set(alerts)),
    interests: Array.from(new Set(interests)),
  };
}
