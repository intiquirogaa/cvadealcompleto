import type { ClientInput, ProfileDetails, SearchResult } from "../types";
import { normalizeText, scoreDataPoint } from "../utils/evidence-ranking";

export interface WebResearchResult {
  profession: ReturnType<typeof scoreDataPoint> | null;
  title: ReturnType<typeof scoreDataPoint> | null;
  profileDetails: ProfileDetails;
}

function shouldInspectPersonResult(client: ClientInput, text: string, rawText: string): boolean {
  const first = normalizeText(client.firstName);
  const last = normalizeText(client.lastName);
  const full = `${first} ${last}`;

  if (text.includes(full) || (last.length > 3 && text.includes(last))) return true;

  if (client.email && text.includes(normalizeText(client.email))) return true;

  if (client.phone) {
    const rawPhone = client.phone.replace(/[\s\-+]/g, '');
    const cleanRawText = rawText.replace(/[\s\-+]/g, '');
    if (rawPhone.length > 6 && cleanRawText.includes(rawPhone)) return true;
  }

  return false;
}

function isBetterLocation(
  candidate: string,
  current: string | null,
  client: ClientInput
): boolean {
  if (!current) return true;

  const normCandidate = normalizeText(candidate);
  const normCurrent = normalizeText(current);
  const localityTokens = normalizeText(client.locality || "")
    .split(/\s+/)
    .filter(t => t.length > 3);

  const candidateMatchesLocality = localityTokens.some(t =>
    normCandidate.includes(t)
  );
  const currentMatchesLocality = localityTokens.some(t =>
    normCurrent.includes(t)
  );

  if (candidateMatchesLocality && !currentMatchesLocality) return true;
  return (
    candidate.length > current.length &&
    candidateMatchesLocality === currentMatchesLocality
  );
}

export function extractWebData(
  client: ClientInput,
  evidence: SearchResult[]
): WebResearchResult {
  let bestProfession: string | null = null;
  let bestTitle: string | null = null;
  let professionSourceUrl = "";
  let titleSourceUrl = "";
  let detectedCompany: { value: string; sourceUrl: string } | null = null;
  let currentLocation: { value: string; sourceUrl: string } | null = null;

  const education = new Map<string, string>();
  const experience = new Map<string, string>();
  const socialMetrics: ProfileDetails["socialMetrics"] = [];
  const socialMetricPlatforms = new Set<string>();

  const professions = [
    "arquitecto",
    "ingeniero",
    "abogado",
    "doctor",
    "medico",
    "consultor",
    "desarrollador",
    "contador",
    "empresario",
    "ceo",
    "director",
    "gerente",
    "asesor",
    "representante",
  ];

  const phoneAssociations: any[] = [];
  const publicMentions: any[] = [];

  for (const res of evidence) {
    const raw = `${res.title} ${res.snippet}`;
    const text = normalizeText(raw);

    if (!shouldInspectPersonResult(client, text, raw.toLowerCase())) continue;

    // Check if it's a phone-only or email-only association (no name)
    const first = normalizeText(client.firstName);
    const last = normalizeText(client.lastName);
    const hasName = text.includes(`${first} ${last}`) || (last.length > 3 && text.includes(last));
    
    if (!hasName) {
      if (client.phone) {
         const rawPhone = client.phone.replace(/[\s\-+]/g, '');
         const cleanRawText = raw.toLowerCase().replace(/[\s\-+]/g, '');
         if (rawPhone.length > 6 && cleanRawText.includes(rawPhone)) {
           phoneAssociations.push(`Teléfono encontrado en: ${res.snippet} (${res.url})`);
         }
      }
      if (client.email && text.includes(normalizeText(client.email))) {
         publicMentions.push(`Email encontrado en: ${res.snippet} (${res.url})`);
      }
    }

    if (!bestProfession) {
      for (const p of professions) {
        if (text.includes(p)) {
          bestProfession = p;
          professionSourceUrl = res.url;
          break;
        }
      }
    }

    if (!bestTitle) {
      if (
        text.includes("ceo") ||
        text.includes("founder") ||
        text.includes("fundador")
      ) {
        bestTitle = "CEO / Fundador";
        titleSourceUrl = res.url;
      } else if (text.includes("director")) {
        bestTitle = "Director";
        titleSourceUrl = res.url;
      } else if (text.includes("gerente") || text.includes("manager")) {
        bestTitle = "Gerente / Manager";
        titleSourceUrl = res.url;
      } else if (text.includes("representante")) {
        bestTitle = "Representante";
        titleSourceUrl = res.url;
      }
    }

    const expMatches =
      raw.match(/(?:Experiencia|Works? at|Trabaja en)[:\s]*([^·•󱚸󱜧]+)/gi) || [];
    for (const match of expMatches) {
      const value = match
        .replace(/^(Experiencia|Works? at|Trabaja en)[:\s]*/i, "")
        .trim();
      if (value.length > 2 && value.length < 80) experience.set(value, res.url);
    }

    const representativeMatch = raw.match(/(Representante[^·•󱚸󱜧]{3,80})/i);
    if (representativeMatch?.[1]) {
      experience.set(representativeMatch[1].trim(), res.url);
    }

    const linkedinCompany = raw.match(
      /(?:CEO|Ceo|Director|Gerente|Founder|Fundador)\s+([^·|\-]{3,80})/
    );
    if (!detectedCompany && linkedinCompany?.[1]) {
      detectedCompany = {
        value: linkedinCompany[1].trim(),
        sourceUrl: res.url,
      };
    }

    const educationMatch = raw.match(
      /(?:Educación|Educacion|Studied at|Estudió en)[:\s]*([^·•󱜧]+)/i
    );
    if (educationMatch?.[1]) {
      const value = educationMatch[1].trim();
      if (value.length > 2 && value.length < 100) education.set(value, res.url);
    }

    const locationMatch = raw.match(
      /(?:Ubicación|Ubicacion|Lives in|Vive en)[:\s]*([^·•󱚸]+)/i
    );
    if (locationMatch?.[1]) {
      const value = locationMatch[1].trim();
      if (
        value.length > 2 &&
        value.length < 80 &&
        isBetterLocation(value, currentLocation?.value || null, client)
      ) {
        currentLocation = { value, sourceUrl: res.url };
      }
    }

    if (res.url.includes("instagram.com")) {
      const followers = raw.match(/([\d.,]+)\s+Followers/i)?.[1];
      const following = raw.match(/([\d.,]+)\s+Following/i)?.[1];
      const posts = raw.match(/([\d.,]+)\s+Posts/i)?.[1];

      if (
        (followers || following || posts) &&
        !socialMetricPlatforms.has("instagram")
      ) {
        socialMetricPlatforms.add("instagram");
        socialMetrics.push({
          platform: "instagram",
          followers,
          following,
          posts,
          sourceUrl: res.url,
        });
      }
    }
  }

  return {
    profession: bestProfession
      ? scoreDataPoint(
          bestProfession,
          professionSourceUrl,
          client,
          evidence,
          60
        )
      : null,
    title: bestTitle
      ? scoreDataPoint(bestTitle, titleSourceUrl, client, evidence, 60)
      : null,
    profileDetails: {
      detectedRole: bestTitle
        ? scoreDataPoint(bestTitle, titleSourceUrl, client, evidence, 70)
        : undefined,
      detectedCompany: detectedCompany
        ? scoreDataPoint(
            detectedCompany.value,
            detectedCompany.sourceUrl,
            client,
            evidence,
            70
          )
        : undefined,
      currentLocation: currentLocation
        ? scoreDataPoint(
            currentLocation.value,
            currentLocation.sourceUrl,
            client,
            evidence,
            70
          )
        : undefined,
      education: Array.from(education.entries())
        .slice(0, 4)
        .map(([value, sourceUrl]) =>
          scoreDataPoint(value, sourceUrl, client, evidence, 65)
        ),
      experience: Array.from(experience.entries())
        .slice(0, 5)
        .map(([value, sourceUrl]) =>
          scoreDataPoint(value, sourceUrl, client, evidence, 65)
        ),
      phoneAssociations,
      socialMetrics,
      publicMentions,
    },
  };
}
