// ============================================================
// OSINT Intelligence Platform — Agent Registry
// ============================================================
// Central registry for all specialized agents. The planner
// uses this to discover and invoke agents by ID.
// ============================================================

import type { OsintAgent } from "./base-agent";
import type { EntityField } from "../types";
import { logger } from "../observability/logger";

export class AgentRegistry {
  private readonly agents = new Map<string, OsintAgent>();

  register(agent: OsintAgent): void {
    if (this.agents.has(agent.id)) {
      logger.warn("Agent already registered, overwriting", { agentId: agent.id });
    }
    this.agents.set(agent.id, agent);
    logger.info("Agent registered", {
      agentId: agent.id,
      name: agent.name,
      capabilities: agent.capabilities,
    });
  }

  get(agentId: string): OsintAgent | null {
    return this.agents.get(agentId) ?? null;
  }

  getAll(): OsintAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Find agents that can contribute to a specific entity field.
   */
  findByCapability(field: EntityField): OsintAgent[] {
    return this.getAll().filter((a) => a.capabilities.includes(field));
  }

  getRegisteredIds(): string[] {
    return Array.from(this.agents.keys());
  }
}

/** Singleton instance */
export const agentRegistry = new AgentRegistry();

// ── Agent IDs (constants for type-safe references) ──

export const AGENT_IDS = {
  SEARCH: "search",
  IDENTITY: "identity",
  COMPANY: "company",
  SOCIAL: "social",
  PHONE: "phone",
  EMAIL: "email",
  NEWS: "news",
  WEBSITE: "website",
} as const;

export type AgentId = typeof AGENT_IDS[keyof typeof AGENT_IDS];
