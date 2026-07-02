import { OpenAI } from "openai";
import type { PersonProfileView, CompanyProfileView, AIInsights, GraphEntity } from "../types";
import { logger } from "../observability/logger";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class AIReasoner {
  
  public async generateInsights(
    personProfile: PersonProfileView,
    companyProfile: CompanyProfileView | null,
    overallConfidence: number
  ): Promise<AIInsights | null> {
    
    if (!process.env.OPENAI_API_KEY) {
      logger.warn("AIReasoner skipped: OPENAI_API_KEY not found");
      return null;
    }

    try {
      const prompt = this.buildPrompt(personProfile, companyProfile);

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Cost-effective model suitable for reasoning
        messages: [
          {
            role: "system",
            content: `Eres un asistente de inteligencia de ventas (OSINT AI). 
Tu objetivo es analizar un perfil de un posible cliente de bienes raíces (desarrolladora/constructora) y extraer insights comerciales útiles.
Responde estrictamente en formato JSON válido que coincida con la siguiente estructura:
{
  "summary": "Resumen ejecutivo del perfil en 2 líneas",
  "interests": ["interés 1", "interés 2"],
  "salesOpportunities": ["oportunidad 1", "oportunidad 2"],
  "salesStrategy": "Cómo abordar al cliente (1-2 párrafos)",
  "purchasingPower": "Estimación del poder adquisitivo basado en su rol y empresa (Alto, Medio, Bajo, Desconocido)",
  "professionalProfile": "Descripción de su trayectoria y rol",
  "alerts": ["alerta 1", "alerta 2", "(ej. cuidado con X, competidor, etc.)"],
  "overallConfidence": ${Math.round(overallConfidence)}
}
Asegúrate de NO incluir markdown (ni \`\`\`json). Devuelve únicamente el JSON. Si un dato no se conoce, usa "Desconocido" o una lista vacía.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
      });

      const responseText = response.choices[0].message.content || "{}";
      const cleanedText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      
      const aiInsights = JSON.parse(cleanedText) as AIInsights;
      return aiInsights;

    } catch (error) {
      logger.error("AIReasoner failed to generate insights", { error: String(error) });
      return null;
    }
  }

  private buildPrompt(personProfile: PersonProfileView, companyProfile: CompanyProfileView | null): string {
    const p = personProfile.person.properties as any;
    
    let text = `Información del Prospecto:\n\n`;
    text += `- Nombre: ${p.firstName || ""} ${p.lastName || ""}\n`;
    text += `- Profesión: ${p.profession || "Desconocida"}\n`;
    
    if (personProfile.position) {
      const pos = personProfile.position.properties as any;
      text += `- Cargo actual: ${pos.title || "Desconocido"}\n`;
    }
    
    if (companyProfile) {
      const c = companyProfile.company.properties as any;
      text += `- Empresa: ${c.name || "Desconocida"}\n`;
      text += `- Industria: ${c.industry || "Desconocida"}\n`;
    }

    if (personProfile.socialProfiles.length > 0) {
      text += `- Redes Sociales Encontradas: ${personProfile.socialProfiles.map(s => (s.properties as any).platform).join(", ")}\n`;
    }
    
    if (personProfile.newsItems.length > 0) {
      text += `- Menciones en Noticias/Web: ${personProfile.newsItems.map(n => (n.properties as any).title).join(" | ")}\n`;
    }

    return text;
  }
}

export const aiReasoner = new AIReasoner();
