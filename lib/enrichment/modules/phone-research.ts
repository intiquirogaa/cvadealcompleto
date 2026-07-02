import type { ClientInput, PhoneAssociation, SearchResult } from "../types";
import { normalizeText } from "../utils/evidence-ranking";

function buildPhoneVariants(phone?: string): string[] {
  if (!phone) return [];

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return [];

  const variants = new Set<string>();
  const add = (value: string) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (normalized.length >= 7) variants.add(normalized);
  };

  add(phone);
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
  add(`+54 ${national}`);
  add(`54 ${national}`);
  add(`+54 9 ${national}`);
  add(`54 9 ${national}`);

  if (national.length >= 10) {
    const areaCode = national.slice(0, national.length - 7);
    const subscriber = national.slice(-7);
    add(`0${areaCode} 15 ${subscriber}`);
    add(`${areaCode} 15 ${subscriber}`);
    add(`${areaCode}-${subscriber}`);
    add(`${areaCode} ${subscriber}`);
  }

  return Array.from(variants);
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function categorize(result: SearchResult): PhoneAssociation["category"] {
  const host = hostOf(result.url);
  const text = normalizeText(`${result.title} ${result.snippet} ${result.url}`);

  if (
    /facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|x\.com|twitter\.com/.test(
      host
    )
  ) {
    return "perfil social";
  }

  if (
    text.includes("mercadolibre") ||
    text.includes("marketplace") ||
    text.includes("clasificado") ||
    text.includes("vende") ||
    text.includes("venta") ||
    text.includes("alquiler") ||
    text.includes("usado") ||
    text.includes("vehiculo") ||
    text.includes("inmueble")
  ) {
    return "clasificado";
  }

  if (
    text.includes("comercio") ||
    text.includes("empresa") ||
    text.includes("servicio") ||
    text.includes("contacto") ||
    text.includes("whatsapp") ||
    text.includes("turnos")
  ) {
    return "comercial";
  }

  if (
    text.includes("directorio") ||
    text.includes("telefono") ||
    text.includes("teléfono") ||
    text.includes("guia") ||
    text.includes("guía")
  ) {
    return "directorio";
  }

  return "mención pública";
}

export function extractPhoneAssociations(
  client: ClientInput,
  evidence: SearchResult[]
): PhoneAssociation[] {
  const variants = buildPhoneVariants(client.phone);
  const variantDigits = variants.map(digitsOnly).filter(v => v.length >= 7);
  const uniqueVariantDigits = Array.from(new Set(variantDigits));

  if (uniqueVariantDigits.length === 0) return [];

  const first = normalizeText(client.firstName);
  const last = normalizeText(client.lastName);
  const full = `${first} ${last}`;
  const localityTokens = normalizeText(client.locality || "")
    .split(/\s+/)
    .filter(t => t.length > 3);

  const associations: PhoneAssociation[] = [];
  const seen = new Set<string>();

  for (const result of evidence) {
    const visibleRaw = `${result.title} ${result.snippet}`;
    const raw = `${visibleRaw} ${result.url}`;
    const normalized = normalizeText(raw);
    const visibleDigits = digitsOnly(visibleRaw);
    const urlDigits = digitsOnly(result.url);

    // Do not treat a Bing/search result as phone-related unless the page result
    // actually exposes a meaningful phone-like digit sequence. An empty digit
    // string would otherwise match every phone variant.
    if (visibleDigits.length < 7 && urlDigits.length < 7) continue;

    const matchedDigits = uniqueVariantDigits.find(variant => {
      if (variant.length < 7) return false;
      return visibleDigits.includes(variant) || urlDigits.includes(variant);
    });

    if (!matchedDigits) continue;

    const key = `${result.url}:${matchedDigits}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const matchReasons = [`Teléfono publicado: ${matchedDigits}`];
    let confidence = 45;

    if (normalized.includes(full)) {
      confidence += 30;
      matchReasons.push("Coincide nombre completo");
    } else if (last.length > 3 && normalized.includes(last)) {
      confidence += 20;
      matchReasons.push("Coincide apellido");
    }

    if (localityTokens.some(token => normalized.includes(token))) {
      confidence += 15;
      matchReasons.push("Coincide localidad/zona");
    }

    const category = categorize(result);
    if (category === "perfil social") confidence += 10;
    if (category === "clasificado")
      matchReasons.push("Posible publicación de venta/alquiler");
    if (category === "comercial")
      matchReasons.push("Posible contacto comercial");

    associations.push({
      title: result.title || hostOf(result.url),
      url: result.url,
      source: hostOf(result.url),
      snippet: result.snippet,
      category,
      matchedPhone: matchedDigits,
      matchReasons,
      confidence: Math.min(confidence, 95),
    });
  }

  return associations.sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}
