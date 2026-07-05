// ============================================================
// OSINT Platform — Rule-Based Reasoner
// ============================================================
// Produces the same AIInsights shape as ai-reasoner.ts, but from
// fixed heuristics over the accumulated evidence instead of an
// LLM call. Used as the fallback when OPENAI_API_KEY isn't set —
// previously the system just skipped analysis entirely in that
// case, leaving purchasingPower/professionalProfile empty for
// every lead until someone configured a paid key.
//
// Not meant to fully replace the LLM: keyword matching can't
// capture nuance the way a model reading full context can. It's
// a best-effort estimate, and every insight documents which
// signals produced it so a salesperson can judge how much to
// trust it.
// ============================================================

import type { PersonProfileView, CompanyProfileView, AIInsights } from "../types";
import { normalizeText, ARGENTINE_REGIONS } from "../infrastructure/normalization";
import { buildNewsConclusions } from "../infrastructure/news-conclusions";
import { buildSocialConclusions } from "../infrastructure/social-conclusions";

type IncomeLevel = "Alto" | "Medio" | "Bajo" | "Desconocido";

interface OccupationSignal {
  level: IncomeLevel;
  label: string;
  keywords: string[];
}

// Order matters only for the "first match wins" fallback path — the
// student+job-search combo check below takes priority over all of these.
const OCCUPATION_SIGNALS: OccupationSignal[] = [
  {
    level: "Alto",
    label: "Deportista o figura pública de alto perfil",
    keywords: [
      "futbolista", "jugador profesional", "deportista profesional", "atleta profesional",
      "seleccion nacional", "campeon del mundo", "club de futbol", "liga profesional",
      "actor", "actriz", "cantante", "artista reconocido", "celebridad",
    ],
  },
  {
    level: "Alto",
    label: "Empresario o alta dirección",
    keywords: [
      "empresario", "fundador", "ceo", "presidente de", "dueno de", "propietario de",
      "co-fundador", "founder",
    ],
  },
  {
    level: "Medio",
    label: "Profesional establecido / mando medio",
    keywords: [
      "director", "gerente general", "socio", "abogado", "medico", "arquitecto",
      "ingeniero", "consultor senior", "gerente", "contador",
    ],
  },
  {
    level: "Medio",
    label: "Profesional en desarrollo",
    keywords: [
      "consultor", "analista", "asesor", "representante", "empleado de", "coordinador",
    ],
  },
  {
    level: "Bajo",
    label: "Estudiante o en búsqueda laboral",
    keywords: [
      "estudiante", "recien graduado", "pasante", "becario", "postulante",
    ],
  },
];

const JOB_SEARCH_KEYWORDS = [
  "busca empleo", "busqueda laboral", "en busqueda de trabajo", "desempleado",
  "cv disponible", "portal de empleo", "bolsa de trabajo", "busco trabajo",
  "disponibilidad inmediata", "open to work",
];

const STUDENT_KEYWORDS = ["estudiante", "universidad", "facultad de", "carrera de", "cursando"];

function collectText(personProfile: PersonProfileView, companyProfile: CompanyProfileView | null): string {
  const parts: string[] = [];
  const p = personProfile.person.properties as any;
  if (typeof p.profession === "string") parts.push(p.profession);

  if (personProfile.position) {
    const pos = personProfile.position.properties as any;
    if (typeof pos.title === "string") parts.push(pos.title);
  }

  for (const news of personProfile.newsItems) {
    const props = news.properties as any;
    if (typeof props.title === "string") parts.push(props.title);
    if (typeof props.snippet === "string") parts.push(props.snippet);
    if (typeof props.category === "string") parts.push(props.category);
  }

  // Bio and business category come from real page data (apify-social.provider.ts),
  // not just a search snippet — a "Fundadora en Estudio X" bio or a business
  // account categorized "Real Estate Agent" is as strong an occupation signal
  // as a news mention, and previously never reached detectIncomeLevel() at all.
  for (const social of personProfile.socialProfiles) {
    const props = social.properties as any;
    if (typeof props.bio === "string") parts.push(props.bio);
    if (typeof props.businessCategory === "string") parts.push(props.businessCategory);
  }

  if (companyProfile) {
    const c = companyProfile.company.properties as any;
    if (typeof c.name === "string") parts.push(c.name);
    if (typeof c.industry === "string") parts.push(c.industry);
  }

  return normalizeText(parts.join(" . "));
}

function detectIncomeLevel(text: string): { level: IncomeLevel; reasoning: string } {
  const hasJobSearchSignal = JOB_SEARCH_KEYWORDS.some((k) => text.includes(k));
  const hasStudentSignal = STUDENT_KEYWORDS.some((k) => text.includes(k));

  // A student actively job-hunting is a stronger, more specific signal than
  // any single keyword match below — check it first regardless of order.
  if (hasStudentSignal && hasJobSearchSignal) {
    return {
      level: "Bajo",
      reasoning: "Señales de ser estudiante combinadas con búsqueda laboral activa (menciones de CV, portal de empleo, o similar).",
    };
  }

  for (const signal of OCCUPATION_SIGNALS) {
    const matched = signal.keywords.filter((k) => text.includes(k));
    if (matched.length > 0) {
      return {
        level: signal.level,
        reasoning: `${signal.label} — coincidencias encontradas: ${matched.slice(0, 3).join(", ")}.`,
      };
    }
  }

  return { level: "Desconocido", reasoning: "No se encontraron señales suficientes en el perfil, noticias o empresa asociada." };
}

function detectRegion(text: string, declaredLocality?: string): string | null {
  if (declaredLocality) {
    const normalizedLocality = normalizeText(declaredLocality);
    const match = ARGENTINE_REGIONS.find((r) => normalizedLocality.includes(r));
    if (match) return match;
  }
  return ARGENTINE_REGIONS.find((r) => text.includes(r)) ?? null;
}

function buildProfessionalProfile(
  personProfile: PersonProfileView,
  companyProfile: CompanyProfileView | null,
  incomeReasoning: string,
): string {
  const p = personProfile.person.properties as any;
  const parts: string[] = [];

  if (typeof p.profession === "string" && p.profession) {
    parts.push(`Profesión detectada: ${p.profession}.`);
  }
  if (personProfile.position) {
    const pos = personProfile.position.properties as any;
    if (typeof pos.title === "string" && pos.title) parts.push(`Cargo: ${pos.title}.`);
  }
  if (companyProfile) {
    const c = companyProfile.company.properties as any;
    if (typeof c.name === "string" && c.name) parts.push(`Empresa asociada: ${c.name}.`);
  }
  if (personProfile.newsItems.length > 0) {
    parts.push(`${personProfile.newsItems.length} mención(es) en noticias/web públicas.`);
  }
  parts.push(incomeReasoning);

  return parts.length > 0
    ? parts.join(" ")
    : "No hay suficiente información pública para construir un perfil profesional.";
}

/**
 * Buckets overallConfidence into a plain-language band + recommendation —
 * the salesperson otherwise only sees a bare 0-100 number with no guidance
 * on how much weight to put on it before acting.
 */
function confidenceBand(confidence: number): { label: string; recommendation: string } {
  if (confidence >= 70) {
    return {
      label: "Alta",
      recommendation: "los datos son sólidos — se puede personalizar la propuesta con confianza.",
    };
  }
  if (confidence >= 40) {
    return {
      label: "Media",
      recommendation: "conviene confirmar los datos clave (profesión, empresa, ubicación) con el lead antes de personalizar la propuesta.",
    };
  }
  return {
    label: "Baja",
    recommendation: "la información pública encontrada es escasa — tratar esto como estimación preliminar y validar todo directamente con el lead.",
  };
}

function buildSummary(
  personProfile: PersonProfileView,
  incomeLevel: IncomeLevel,
  overallConfidence: number,
): string {
  const p = personProfile.person.properties as any;
  const name = `${p?.firstName || ""} ${p?.lastName || ""}`.trim();
  const socialCount = personProfile.socialProfiles.length;
  const newsCount = personProfile.newsItems.length;
  const professionLabel = personProfile.position
    ? (personProfile.position.properties as any).title
    : p?.profession;
  const professionClause = professionLabel
    ? ` Rol/profesión detectada: ${professionLabel}.`
    : " No se detectó profesión ni cargo con evidencia suficiente.";
  const band = confidenceBand(overallConfidence);

  return `${name || "El lead"} tiene ${socialCount} perfil(es) social(es) y ${newsCount} mención(es) públicas encontradas. Poder adquisitivo estimado: ${incomeLevel}.${professionClause} Confianza de la información: ${Math.round(overallConfidence)}% (${band.label}) — ${band.recommendation}`;
}

class RuleBasedReasoner {
  generateInsights(
    personProfile: PersonProfileView,
    companyProfile: CompanyProfileView | null,
    overallConfidence: number,
  ): AIInsights {
    const text = collectText(personProfile, companyProfile);
    const { level: incomeLevel, reasoning: incomeReasoning } = detectIncomeLevel(text);
    const declaredLocality = (personProfile.person.properties as any).locality as string | undefined;
    const region = detectRegion(text, declaredLocality);

    const allNewsItems = [...personProfile.newsItems, ...(companyProfile?.newsItems ?? [])];
    const newsConclusions = buildNewsConclusions(allNewsItems);
    const socialConclusions = buildSocialConclusions(personProfile.socialProfiles);
    const salesOpportunities = [...newsConclusions, ...socialConclusions.opportunities];

    const alerts: string[] = [...socialConclusions.alerts];
    if (incomeLevel === "Desconocido") {
      alerts.push("No se pudo estimar el poder adquisitivo — perfil con poca información pública.");
    }
    if (!region) {
      alerts.push("No se detectó provincia/región — confirmar con el lead directamente.");
    } else {
      alerts.push(`Región detectada por reglas: ${region}. Confirmar con el lead.`);
    }

    return {
      summary: buildSummary(personProfile, incomeLevel, overallConfidence),
      interests: socialConclusions.interests,
      salesOpportunities,
      salesStrategy: "Estimación generada por reglas (sin IA configurada) — usar como punto de partida, no como conclusión definitiva. Confirmar datos clave con el lead antes de personalizar la propuesta.",
      purchasingPower: incomeLevel,
      professionalProfile: buildProfessionalProfile(personProfile, companyProfile, incomeReasoning),
      alerts,
      overallConfidence: Math.round(overallConfidence),
    };
  }
}

export const ruleBasedReasoner = new RuleBasedReasoner();
