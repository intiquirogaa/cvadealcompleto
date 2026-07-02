// ============================================================
// OSINT Intelligence Platform — Identity Agent
// ============================================================
// Analyzes search evidence to determine if a found person
// is the right person.  Uses SignalType matching and
// computeAuthenticity to score confidence.
//
// Creates/updates the Person entity and generates suggestions
// for downstream agents (company, social, phone, email).
// ============================================================

import type { AgentInput, AgentOutput, EntityField, EvidenceRecord, SignalType, GraphEntity, PersonProperties } from "../types";
import type { AgentContext } from "./base-agent";
import { BaseAgent } from "./base-agent";
import { AGENT_IDS } from "./agent.registry";
import {
  generateNameVariants,
  getPhoneDigitPatterns,
  computeAuthenticity,
  type AuthenticityMatch,
} from "../infrastructure/normalization";

export class IdentityAgent extends BaseAgent {
  readonly id = AGENT_IDS.IDENTITY;
  readonly name = "Identity Agent";
  readonly capabilities: readonly EntityField[] = [
    "person.profession", "person.company", "person.position",
    "person.phone", "person.email", "person.location",
  ];

  protected async execute(input: AgentInput, ctx: AgentContext): Promise<AgentOutput> {
    const output = this.emptyOutput();
    const hints = input.hints;

    const firstName = hints.firstName as string | undefined;
    const lastName = hints.lastName as string | undefined;
    const email = hints.email as string | undefined;
    const phone = hints.phone as string | undefined;
    const company = hints.company as string | undefined;
    const locality = hints.locality as string | undefined;
    const evidence = (hints.searchEvidence as EvidenceRecord[] | undefined) ?? [];

    if (!firstName || !lastName) {
      ctx.logger.warn("IdentityAgent: missing firstName/lastName");
      return output;
    }

    // Check if Person entity already exists in the graph
    const existingPerson = ctx.graph.findPerson(`${firstName} ${lastName}`);
    if (existingPerson) {
      ctx.logger.debug("IdentityAgent: person already in graph", {
        entityId: existingPerson.id,
        confidence: existingPerson.confidence,
      });
      // Still analyze evidence for additional suggestions
      output.entities.push(existingPerson);
    }

    // Build matching signals
    const nameVariants = generateNameVariants(firstName, lastName);
    const phoneDigits = phone ? getPhoneDigitPatterns(phone) : [];

    // Analyze each evidence record
    let bestMatch: { evidence: EvidenceRecord; signal: SignalType; score: number } | null = null;
    const matchedEvidence: EvidenceRecord[] = [];

    for (const ev of evidence) {
      const text = `${ev.title} ${ev.snippet}`;
      const authenticity = computeAuthenticity(
        text,
        { email, locality, company },
        nameVariants,
        phoneDigits,
      );

      // Determine the signal type
      const signal = this.determineSignalType(authenticity, company, locality);

      if (authenticity.score > 0) {
        matchedEvidence.push(ev);

        if (!bestMatch || authenticity.score > bestMatch.score) {
          bestMatch = { evidence: ev, signal, score: authenticity.score };
        }

        // Attach evidence ref to the evidence
        ev.entityId = existingPerson?.id;
      }
    }

    // Passive Extraction from Evidence
    let extractedProfession = hints.profession as string | undefined;
    let extractedLocality = locality;
    let extractedCompany = company;
    let extractedTitle: string | undefined;

    const professions = [
      "arquitecto", "ingeniero", "abogado", "doctor", "medico",
      "consultor", "desarrollador", "contador", "empresario",
      "ceo", "director", "gerente", "asesor", "representante", "fundador"
    ];

    for (const ev of matchedEvidence) {
      const text = `${ev.title} ${ev.snippet}`.toLowerCase();
      if (!extractedProfession) {
        for (const p of professions) {
          if (text.includes(p)) {
            extractedProfession = p;
            break;
          }
        }
      }
      if (!extractedTitle) {
        if (text.includes("ceo") || text.includes("founder") || text.includes("fundador")) extractedTitle = "CEO / Fundador";
        else if (text.includes("director")) extractedTitle = "Director";
        else if (text.includes("gerente") || text.includes("manager")) extractedTitle = "Gerente / Manager";
        else if (text.includes("representante")) extractedTitle = "Representante";
      }
      if (!extractedCompany) {
        const linkedinCompany = text.match(/(?:ceo|director|gerente|founder|fundador)\s+([^·|\-]{3,40})/i);
        if (linkedinCompany?.[1]) extractedCompany = linkedinCompany[1].trim();
      }
      if (!extractedLocality) {
        const locationMatch = text.match(/(?:ubicación|ubicacion|lives in|vive en)[:\s]*([^·•]{3,40})/i);
        if (locationMatch?.[1]) extractedLocality = locationMatch[1].trim();
      }
    }

    // Create or update Person entity
    const personProps: PersonProperties = {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      normalizedFullName: `${firstName} ${lastName}`.toLowerCase().trim(),
      emailDomain: email ? email.split("@")[1] : undefined,
      locality: extractedLocality,
      profession: extractedProfession,
    };

    const person = existingPerson ?? this.makeEntity("person", personProps, ctx.runId);
    if (!existingPerson) {
      person.properties = personProps;
    }

    // Attach evidence to the person entity
    for (const ev of matchedEvidence) {
      const signal = bestMatch && ev.id === bestMatch.evidence.id ? bestMatch.signal : "full_name_only";
      person.evidence.push(
        this.makeEvidenceRef(ev.id, ev.sourceDomain, ev.provider, signal),
      );
      output.evidence.push(ev);
    }

    // Set initial confidence based on best match
    if (bestMatch) {
      person.confidence = Math.min(100, bestMatch.score * 100);
    }

    if (!existingPerson) {
      output.entities.push(person);
    } else {
      output.entities.push(person);
    }

    if (extractedTitle) {
      const positionEntity = this.makeEntity("position", { title: extractedTitle, isCurrent: true }, ctx.runId);
      output.entities.push(positionEntity);
      output.relations.push(this.makeRelation("HAS_POSITION", person.id, positionEntity.id, ctx.runId, 70));
    }

    // Generate suggestions for downstream agents
    if (extractedCompany) {
      output.suggestions.push(
        this.makeSuggestion(
          "run_agent",
          "high",
          `Investigate company: ${extractedCompany}`,
          { agentId: "company", companyName: extractedCompany, personEntityId: person.id },
          "person.company",
        ),
      );
    }

    output.suggestions.push(
      this.makeSuggestion(
        "run_agent",
        "high",
        `Search for social profiles of ${firstName} ${lastName}`,
        { agentId: "social", firstName, lastName, company: extractedCompany, personEntityId: person.id },
        "person.linkedin",
      ),
    );

    if (!email) {
      output.suggestions.push(
        this.makeSuggestion(
          "run_agent",
          "medium",
          `Search for email of ${firstName} ${lastName}`,
          { agentId: "email", firstName, lastName, company, personEntityId: person.id },
          "person.email",
        ),
      );
    }

    if (!phone) {
      output.suggestions.push(
        this.makeSuggestion(
          "run_agent",
          "medium",
          `Search for phone of ${firstName} ${lastName}`,
          { agentId: "phone", firstName, lastName, company, locality, personEntityId: person.id },
          "person.phone",
        ),
      );
    }

    output.metrics.queriesExecuted = 0; // Identity agent analyzes, doesn't search
    output.metrics.resultsFound = matchedEvidence.length;

    return output;
  }

  /**
   * Determine the SignalType based on what was matched.
   */
  private determineSignalType(
    auth: AuthenticityMatch,
    company?: string,
    locality?: string,
  ): SignalType {
    if (auth.emailMatched) return "exact_email";
    if (auth.phoneMatched) return "exact_phone";
    if (company && auth.companyMatched) return "full_name_company";
    if (locality && auth.locationMatched) return "full_name_location";

    // Check name match strength
    if (auth.nameMatchStrength >= 0.8) return "full_name_only";
    if (auth.nameMatchStrength >= 0.5) return "surname_rare";
    if (auth.nameMatchStrength > 0) return "surname_common";

    return "first_name_only";
  }
}
