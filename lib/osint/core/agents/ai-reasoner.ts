import { OpenAI } from "openai";
import type { PersonProfileView, CompanyProfileView, AIInsights, GraphEntity } from "../types";
import { logger } from "../observability/logger";

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
      // Instantiated lazily (not at module load) so importing this file
      // never throws when OPENAI_API_KEY is unset — the check above
      // already short-circuits that case.
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
El "summary" debe terminar SIEMPRE con una conclusión explícita de tres partes: (1) el poder adquisitivo estimado, (2) la profesión/rol detectado, y (3) el nivel de confianza de la información con una recomendación acorde — confianza >= 70 ("Alta": los datos son sólidos, se puede personalizar la propuesta con confianza), 40-69 ("Media": confirmar los datos clave con el lead antes de personalizar), < 40 ("Baja": tratar como estimación preliminar y validar todo con el lead). overallConfidence ya viene dado (${Math.round(overallConfidence)}), no lo inventes.
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
      const describeSocial = (s: GraphEntity) => {
        const props = s.properties as any;
        const details: string[] = [props.platform];
        if (props.verified) details.push("verificada");
        if (props.isBusinessAccount) details.push(`cuenta de negocio${props.businessCategory ? ` (${props.businessCategory})` : ""}`);
        if (typeof props.followers === "number") details.push(`${props.followers} seguidores`);
        if (props.bio) details.push(`bio: "${props.bio}"`);
        if (props.publicEmail || props.publicPhoneNumber) details.push("tiene contacto público en el perfil");
        if (props.externalUrl) details.push(`link externo: ${props.externalUrl}`);
        if (props.city) details.push(`ciudad: ${props.city}`);
        return details.join(", ");
      };
      text += `- Redes Sociales Encontradas:\n${personProfile.socialProfiles.map((s) => `  - ${describeSocial(s)}`).join("\n")}\n`;
    }
    
    const describeNews = (n: GraphEntity) => {
      const props = n.properties as any;
      return `${props.title} [${props.category ?? "public_mention"}]`;
    };

    if (personProfile.newsItems.length > 0) {
      text += `- Menciones en Noticias/Web sobre la persona: ${personProfile.newsItems.map(describeNews).join(" | ")}\n`;
    }

    if (companyProfile?.newsItems.length) {
      text += `- Noticias recientes sobre la empresa: ${companyProfile.newsItems.map(describeNews).join(" | ")}\n`;
    }

    text += `\nUsa la categoría entre corchetes (expansion, investment, hiring, award, event, public_tender, interview, public_mention) para generar salesOpportunities concretas y accionables (ej. "Está contratando vendedores", "Empresa en expansión", "Recibió inversión reciente"), no solo un resumen de que existen noticias.\n`;
    text += `Usa la bio, seguidores, verificación, tipo de cuenta (negocio/categoría) y contacto público de las redes sociales como señales reales para estimar purchasingPower, professionalProfile e interests — no te limites a mencionar que existe la red social.\n`;

    return text;
  }
}

export const aiReasoner = new AIReasoner();
