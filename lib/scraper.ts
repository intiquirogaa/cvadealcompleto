/**
 * @deprecated This file is legacy dead code.
 * The new OSINT platform lives in `lib/osint/`.
 * This file is only referenced by `scripts/test-scraper.ts`.
 * Do not import from here in new code.
 * Scheduled for removal in Phase 2.
 */

import OpenAI from 'openai';

export interface EnrichedProfile {
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  profession?: string;
  company?: string;
  foundRealData: boolean;
  insights: string[];
}

export async function fetchDuckDuckGo(query: string): Promise<string> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch from DuckDuckGo: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

export function parseDuckDuckGoHTML(html: string): { urls: string[]; snippets: string[] } {
  const snippetRegex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/g;
  const urlRegex = /<a class="result__url" href="([^"]+)">/g;

  let snippets: string[] = [];
  let urls: string[] = [];
  let m;

  while ((m = snippetRegex.exec(html)) !== null) {
    snippets.push(m[1].replace(/<[^>]+>/g, '').trim());
  }

  while ((m = urlRegex.exec(html)) !== null) {
    let link = m[1];
    if (link.includes('duckduckgo.com/l/?uddg=')) {
      link = decodeURIComponent(link.split('uddg=')[1].split('&')[0]);
    } else if (link.startsWith('/l/?uddg=')) {
      link = decodeURIComponent(link.split('uddg=')[1].split('&')[0]);
    }
    urls.push(link);
  }

  return { urls, snippets };
}

export function containsName(text: string, fullName: string): boolean {
  // Normalize strings: remove accents and lowercase
  const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  
  const textNorm = normalize(text);
  const names = normalize(fullName).split(' ').filter(n => n.length > 2);
  
  // Requires at least one significant part of the name to be in the text
  return names.some(namePart => textNorm.includes(namePart));
}

export function extractValidProfile(
  urls: string[],
  snippets: string[],
  fullName: string
): EnrichedProfile {
  let linkedinUrl: string | undefined;
  let instagramUrl: string | undefined;
  let facebookUrl: string | undefined;
  let profession: string | undefined;
  let company: string | undefined;
  let foundRealData = false;
  let insights: string[] = [];

  for (let i = 0; i < urls.length; i++) {
    const link = urls[i] || '';
    const snippet = snippets[i] || '';
    const snippetLower = snippet.toLowerCase();

    // Verify if the snippet actually mentions the person
    if (!containsName(snippet, fullName)) {
      continue; // Skip irrelevant results
    }

    if (link.includes('linkedin.com/in/') && !linkedinUrl) {
      linkedinUrl = link;
      foundRealData = true;
    } else if (link.includes('instagram.com/') && !instagramUrl) {
      instagramUrl = link;
      foundRealData = true;
    } else if (link.includes('facebook.com/') && !facebookUrl) {
      facebookUrl = link;
      foundRealData = true;
    }

    if (!profession) {
      if (
        snippetLower.includes('arquitect') ||
        snippetLower.includes('diseñ') ||
        snippetLower.includes('ingeni') ||
        snippetLower.includes('construc')
      ) {
        profession = 'Profesional de la Construcción';
        insights.push(`Menciones en web relacionadas al sector de la construcción.`);
        foundRealData = true;
      } else if (
        snippetLower.includes('director') ||
        snippetLower.includes('gerente') ||
        snippetLower.includes('ceo') ||
        snippetLower.includes('fundador') ||
        snippetLower.includes('empresari')
      ) {
        profession = 'Cargo Ejecutivo / Empresario';
        company = 'Empresa Privada';
        insights.push(`Ocupa cargos ejecutivos y/o actividad empresarial.`);
        foundRealData = true;
      } else if (
        snippetLower.includes('desarrollador') ||
        snippetLower.includes('inmobiliari') ||
        snippetLower.includes('real estate') ||
        snippetLower.includes('broker')
      ) {
        profession = 'Desarrollador Inmobiliario / Real Estate';
        insights.push(`Vinculado al rubro inmobiliario.`);
        foundRealData = true;
      } else if (
        snippetLower.includes('abogad') ||
        snippetLower.includes('contador') ||
        snippetLower.includes('médico')
      ) {
        profession = 'Profesional Independiente';
        foundRealData = true;
      } else if (
        snippetLower.includes('asesor') ||
        snippetLower.includes('vendedor') ||
        snippetLower.includes('comerciante')
      ) {
        profession = 'Asesor / Comerciante';
        foundRealData = true;
      }
    }
    
    // Add CUIT insight if present
    if (snippetLower.includes('cuit: ') || snippetLower.includes('cuit ')) {
      insights.push('Se encontró un registro comercial / impositivo (CUIT) público activo en la web.');
      foundRealData = true;
    }
  }

  // Deduplicate insights
  insights = [...new Set(insights)];

  return {
    linkedin: linkedinUrl,
    instagram: instagramUrl,
    facebook: facebookUrl,
    profession,
    company,
    foundRealData,
    insights,
  };
}

export async function analyzeProfileWithAI(fullName: string, locality: string, htmlContext: string) {
  // If OPENAI_API_KEY is missing, we could try Abacus or just throw an error
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured in .env');
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = `Sos un investigador OSINT especializado en enriquecer leads comerciales.

Objetivo:
Encontrar únicamente información pública y verificable sobre la persona indicada.

Persona:
Nombre: ${fullName}
Empresa: 
Ciudad: ${locality || ''}
País: Argentina
Cargo: 
Sitio web de la empresa: 

Proceso obligatorio:
1. Buscar primero el perfil oficial de LinkedIn.
2. Buscar luego: Sitio web oficial, Crunchbase, Google News, Twitter/X, Facebook, Instagram, YouTube, Blogs, Otras menciones.
3. Nunca asumir que dos personas con el mismo nombre son la misma.
4. Antes de aceptar una fuente validar al menos dos coincidencias: Empresa, Ciudad, Cargo, Fotografía, Dominio del email, Historial laboral.
5. Si la confianza es menor al 80%, responder: "No se pudo verificar suficientemente la identidad."
6. Para cada dato indicar la fuente.

A continuación, tienes un CONTEXTO EXTRAIDO DE INTERNET mediante DuckDuckGo sobre esta persona. Analízalo estrictamente:
---
${htmlContext.substring(0, 15000)} // Limiting size for tokens
---

Devolver únicamente JSON con la siguiente estructura (si no encuentras un dato, usa null. Si la identidad no es verificable, setea "verificado": false):
{
  "verificado": boolean,
  "mensaje": "Mensaje de éxito o 'No se pudo verificar suficientemente la identidad.'",
  "linkedin": "url o null",
  "instagram": "url o null",
  "facebook": "url o null",
  "twitter": "url o null",
  "profession": "cargo o null",
  "company": "empresa o null",
  "fuentes": ["fuente 1", "fuente 2"],
  "insights": ["insight 1", "insight 2"]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini', // Using mini to be fast and cost effective, or gpt-4o
    messages: [
      { role: 'system', content: 'You are an OSINT investigator. You only return valid JSON.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const content = response.choices[0]?.message?.content || '{}';
  return JSON.parse(content);
}

