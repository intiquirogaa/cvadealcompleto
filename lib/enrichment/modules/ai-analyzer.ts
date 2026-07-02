import OpenAI from 'openai';
import { datum } from '../utils/confidence';
import type { 
  AIAnalysis, 
  ClientInput, 
  IdentityResult, 
} from '../types';
import type { WebResearchResult } from './web-research';
import type { SocialResearchResult } from './social-profiles';
import type { CompanyResearchResult } from './company-research';
import type { NewsResearchResult } from './news-research';

export async function analyzeWithAI(data: {
  client: ClientInput;
  identity: IdentityResult;
  web: WebResearchResult;
  social: SocialResearchResult;
  company: CompanyResearchResult;
  news: NewsResearchResult;
}): Promise<AIAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey || apiKey.includes('PLACEHOLDER') || apiKey.length < 20) {
    throw new Error('API_KEY_MISSING_OR_INVALID');
  }

  const openai = new OpenAI({ apiKey });

  const inputPayload = {
    target: {
      firstName: data.client.firstName,
      lastName: data.client.lastName,
      email: data.client.email,
      phone: data.client.phone,
      locality: data.client.locality,
    },
    verificationSignals: data.identity.matchedSignals,
    webProfession: data.web.profession?.value,
    webTitle: data.web.title?.value,
    socialBios: data.social.profiles.map((p: any) => ({ platform: p.platform, bio: p.bio })).filter((p: any) => p.bio),
    company: data.company.company ? {
      name: data.company.company.name.value,
      industry: data.company.company.industry?.value,
      website: data.company.company.website?.value,
    } : null,
    newsTitles: data.news.news.map((n: any) => n.title),
    phoneMentions: data.web.profileDetails.phoneAssociations,
    publicMentions: data.web.profileDetails.publicMentions,
  };

  const prompt = `Eres un experto investigador OSINT y estratega de ventas B2B/B2C (Trabajas para CVA Deal, empresa constructora de viviendas y real estate).
Tu tarea EXCLUSIVA es analizar la siguiente evidencia recolectada por nuestro motor local.
NO puedes buscar en internet. Solo usa los datos provistos.
Si la información es insuficiente para dar un insight útil, dilo. No inventes.

EVIDENCIA RECOLECTADA:
${JSON.stringify(inputPayload, null, 2)}

Devuelve estrictamente un objeto JSON con la siguiente estructura exacta:
{
  "summary": "Resumen ejecutivo del perfil profesional de la persona.",
  "interests": ["interes1", "interes2"],
  "salesOpportunities": ["oportunidad1"],
  "salesStrategy": "Estrategia sugerida para abordarlo...",
  "estimatedPurchasingPower": "Muy Alto" | "Alto" | "Medio" | "Bajo" | "Desconocido",
  "professionalProfile": "Breve descripción de su trayectoria o empresa",
  "alerts": ["Alerta relevante basada en noticias o bios, ej: 'Cambio de trabajo reciente'"],
  "overallConfidence": 85 // Número 0-100 reflejando tu confianza en el análisis basado en la evidencia
}
Asegúrate de devolver SOLO JSON válido sin bloques markdown markdown ni texto adicional.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Usamos un modelo rápido y eficiente para esto
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 800,
    });

    const resultText = response.choices[0].message.content || '{}';
    const jsonStr = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonStr);

    return {
      summary: result.summary || 'Sin resumen',
      interests: Array.isArray(result.interests) ? result.interests : [],
      salesOpportunities: Array.isArray(result.salesOpportunities) ? result.salesOpportunities : [],
      salesStrategy: result.salesStrategy || 'Sin estrategia',
      estimatedPurchasingPower: { 
        value: result.estimatedPurchasingPower || 'Desconocido', 
        confidence: typeof result.overallConfidence === 'number' ? result.overallConfidence : 50,
        source: 'OpenAI (Inferencia)',
        lastVerified: new Date().toISOString()
      },
      professionalProfile: result.professionalProfile || 'Desconocido',
      alerts: Array.isArray(result.alerts) ? result.alerts : [],
      overallConfidence: typeof result.overallConfidence === 'number' ? result.overallConfidence : 50,
    };
  } catch (error: any) {
    console.error('[ai-analyzer] OpenAI Error:', error);
    if (error.status === 401) throw new Error('API_KEY_UNAUTHORIZED');
    if (error.status === 429) throw new Error('QUOTA_EXCEEDED_OR_RATE_LIMIT');
    throw new Error('OPENAI_API_ERROR');
  }
}
