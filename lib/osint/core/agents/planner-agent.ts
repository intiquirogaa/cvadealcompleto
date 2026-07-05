// ============================================================
// OSINT Intelligence Platform — Planner Agent
// ============================================================
// The brain of the investigation. Runs an adaptive loop:
//
//   assess → generate → EIG score → execute → merge → score
//
// Each cycle:
//   1. Assess current knowledge state (entities, confidence, gaps)
//   2. Generate candidate actions (from suggestions, missing types)
//   3. Score each action by Expected Information Gain (EIG)
//   4. Execute the highest-EIG action
//   5. Merge the agent's output into the KnowledgeGraph
//   6. Score entities with the ConfidenceEngine
//   7. Check termination (budgets, confidence threshold, no useful actions)
//
// Terminates when any of:
//   - maxCycles reached
//   - maxQueries / maxDurationMs / maxCostUsd exceeded
//   - Average confidence >= autoUpdateCrm threshold
//   - No candidate action has EIG > minimum threshold
// ============================================================

import type {
  AgentInput,
  AgentOutput,
  EntityField,
  EntityType,
  GraphEntity,
  GraphRelation,
  EvidenceRecord,
  EvidenceRef,
  ConfidenceFactors,
  PlannerSuggestion,
  PlannerDecision,
  InvestigationRequest,
  InvestigationResult,
  RunMetrics,
  PersonProfileView,
  CompanyProfileView,
  OsintConfig,
  RelationType,
  SourceType,
  SignalType,
  EntityProperties,
  EmailProperties,
  PhoneProperties,
  PersonProperties,
  CompanyProperties,
  DomainProperties,
  WebsiteProperties,
} from "../types";

import type { AgentContext, OsintAgent } from "./base-agent";
import { AgentRegistry, AGENT_IDS } from "./agent.registry";
import { KnowledgeGraph } from "../persistence/knowledge-graph";
import type { GraphStore, RunRecord } from "../persistence/graph-store";
import type { ProviderRegistry } from "../providers/provider.registry";
import type { ConfidenceEngine } from "../confidence/confidence-engine";
import type { MemoryStore } from "../memory/memory-store";
import type { StructuredLogger } from "../observability/logger";
import { createRunLogger, logger as rootLogger } from "../observability/logger";
import { mergeConfig } from "../../config/default.config";
import { providerScoringEngine } from "../providers/provider.scoring";
import {
  normalizeEmail,
  emailDomain,
  isCorporateEmail,
  digitsOnly,
  normalizeCompanyName,
} from "../infrastructure/normalization";
import { strategyOptimizer } from "../learning/strategy-optimizer";

// ─────────────────────────────────────────────────────────────
// Planner Action — an internal representation of a candidate
// investigation step, scored by Expected Information Gain.
// ─────────────────────────────────────────────────────────────

interface PlannerAction {
  id: string;
  type: "run_agent" | "fetch_page";
  agentId: string;
  hints: Record<string, unknown>;
  expectedFields: EntityField[];
  estimatedQueries: number;
  estimatedCost: number;
  discoveryProbability: number;
  eig: number;
  rationale: string;
  source: string;
}

// ─────────────────────────────────────────────────────────────
// Expected entity types for a person-centric investigation
// ─────────────────────────────────────────────────────────────

const EXPECTED_ENTITY_TYPES: EntityType[] = [
  "person",
  "company",
  "social_profile",
  "phone",
  "email",
  "website",
  "domain",
  "news_item",
];

// Agent → default discovery probability (heuristic) removed. See strategy-optimizer.ts

// Agent → estimated queries per invocation
const AGENT_ESTIMATED_QUERIES: Record<string, number> = {
  [AGENT_IDS.SEARCH]: 6,
  [AGENT_IDS.IDENTITY]: 0,
  [AGENT_IDS.COMPANY]: 3,
  [AGENT_IDS.SOCIAL]: 4,
  [AGENT_IDS.PHONE]: 2,
  [AGENT_IDS.EMAIL]: 2,
  [AGENT_IDS.NEWS]: 3,
  [AGENT_IDS.WEBSITE]: 1,
};

// ─────────────────────────────────────────────────────────────
// Planner Agent
// ─────────────────────────────────────────────────────────────

export class PlannerAgent {
  private readonly registry: AgentRegistry;
  private readonly store: GraphStore;
  private readonly providers: ProviderRegistry;
  private readonly confidenceEngine: ConfidenceEngine;
  private readonly memoryStore: MemoryStore;
  private readonly baseConfig: OsintConfig;

  // Per-investigation state (reset each call)
  private ctx!: AgentContext;
  private graph!: KnowledgeGraph;
  private config!: OsintConfig;
  private runId!: string;
  private traceId!: string;
  private hints: Record<string, unknown> = {};
  private startTime: number = 0;

  private pendingSuggestions: PlannerSuggestion[] = [];
  private executedActionKeys = new Set<string>();
  private auditTrail: PlannerDecision[] = [];
  private queriesExecuted = 0;
  private costUsd = 0;
  private cacheHits = 0;
  private stageTimings: Record<string, number> = {};
  private providerStats: Record<string, {
    requestsSent: number;
    successes: number;
    failures: number;
    cacheHits: number;
    usefulResults: number;
  }> = {};

  constructor(
    registry: AgentRegistry,
    store: GraphStore,
    providers: ProviderRegistry,
    confidenceEngine: ConfidenceEngine,
    memoryStore: MemoryStore,
    baseConfig: OsintConfig,
  ) {
    this.registry = registry;
    this.store = store;
    this.providers = providers;
    this.confidenceEngine = confidenceEngine;
    this.memoryStore = memoryStore;
    this.baseConfig = baseConfig;
  }

  // ═══════════════════════════════════════════════════════════
  // MAIN ENTRY POINT
  // ═══════════════════════════════════════════════════════════

  async investigate(
    request: InvestigationRequest,
    initialHints: Record<string, unknown>,
  ): Promise<InvestigationResult> {
    this.startTime = Date.now();
    this.traceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // 1. Create run in DB
    let run: RunRecord;
    try {
      run = await this.store.createRun({
        id: request.runId,
        clientId: request.clientId,
        trigger: request.trigger,
        triggeredBy: request.triggeredBy,
      });
    } catch (err) {
      rootLogger.error("Failed to create OSINT run", { error: String(err) });
      // Return a failed result with a synthetic runId
      return this.buildFailedResult(request, "Failed to create run");
    }
    this.runId = run.id;

    // 2. Merge config
    this.config = mergeConfig(this.baseConfig, request.options);

    // 3. Set up context
    this.graph = new KnowledgeGraph();
    const runLogger = createRunLogger(this.traceId, this.runId);
    this.ctx = {
      graph: this.graph,
      store: this.store,
      providers: this.providers,
      confidenceEngine: this.confidenceEngine,
      memoryStore: this.memoryStore,
      logger: runLogger,
      config: this.config,
      runId: this.runId,
      traceId: this.traceId,
    };

    // 4. Initialize hints
    this.hints = { ...initialHints, clientId: request.clientId };

    runLogger.info("Investigation started", {
      clientId: request.clientId,
      trigger: request.trigger,
      hints: Object.keys(initialHints),
    });

    // 5. Load memory (existing entities)
    let status: InvestigationResult["status"] = "completed";
    try {
      if (this.config.enableMemoryReuse) {
        await this.loadMemory(request.clientId);
      }
    } catch (err) {
      runLogger.warn("Memory load failed, continuing without", { error: String(err) });
    }

    // 6. Run adaptive loop
    try {
      await this.runAdaptiveLoop();
    } catch (err) {
      runLogger.error("Adaptive loop failed", { error: String(err) });
      status = "failed";
    }

    // 7. Finalize
    const result = await this.finalize(status, request);
    return result;
  }

  // ═══════════════════════════════════════════════════════════
  // MEMORY LOADING
  // ═══════════════════════════════════════════════════════════

  private async loadMemory(clientId: string): Promise<void> {
    const plan = await this.memoryStore.planInvestigation(
      clientId,
      this.config,
      this.store,
      EXPECTED_ENTITY_TYPES,
    );

    // Load existing entities into the graph for reuse
    await this.graph.loadFromStore(this.store, clientId);

    this.ctx.logger.info("Memory loaded", {
      ...plan.stats,
      graphSummary: this.graph.summarize(),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ADAPTIVE LOOP
  // ═══════════════════════════════════════════════════════════

  private async runAdaptiveLoop(): Promise<void> {
    for (let cycle = 0; cycle < this.config.maxCycles; cycle++) {
      // ── Budget checks ──
      const elapsed = Date.now() - this.startTime;
      if (elapsed > this.config.maxDurationMs) {
        this.ctx.logger.warn("Max duration reached", { cycle, elapsed });
        break;
      }
      if (this.queriesExecuted >= this.config.maxQueries) {
        this.ctx.logger.warn("Max queries reached", { cycle, queries: this.queriesExecuted });
        break;
      }
      if (this.costUsd >= this.config.maxCostUsd) {
        this.ctx.logger.warn("Max cost reached", { cycle, cost: this.costUsd });
        break;
      }

      // ── Process investigate_entity suggestions (create entities directly) ──
      this.processInvestigateEntitySuggestions();

      // ── Assess knowledge state ──
      const knowledgeState = this.assessKnowledgeState();

      // ── Generate candidate actions ──
      const candidates = this.generateCandidateActions(cycle);

      // ── Score by EIG ──
      const scored = this.scoreActions(candidates);

      // ── Select best action ──
      const bestAction = scored[0] ?? null;

      // ── Record decision in audit trail ──
      this.recordDecision(cycle, knowledgeState, scored, bestAction);

      // ── Check termination: no useful actions ──
      if (!bestAction || bestAction.eig < 0.05) {
        this.ctx.logger.info("No more useful actions", {
          cycle,
          bestEig: bestAction?.eig ?? 0,
        });
        break;
      }

      // ── Check termination: confidence threshold met ──
      const avgConfidence = this.graph.computeOverallConfidence();
      if (
        avgConfidence >= this.config.confidenceThresholds.autoUpdateCrm &&
        cycle > 0 &&
        this.graph.getEntitiesByType("person").length > 0
      ) {
        this.ctx.logger.info("Confidence threshold met", { cycle, avgConfidence });
        break;
      }

      // ── Execute action ──
      const actionStart = Date.now();
      const remainingMs = Math.max(this.config.maxDurationMs - elapsed, 1000);
      try {
        await this.executeActionWithTimeout(bestAction, remainingMs);
        const actionDuration = Date.now() - actionStart;
        this.ctx.logger.debug("Action executed", {
          cycle,
          action: bestAction.id,
          agentId: bestAction.agentId,
          durationMs: actionDuration,
          eig: bestAction.eig,
        });
      } catch (err) {
        this.ctx.logger.error("Action execution failed", {
          cycle,
          action: bestAction.id,
          error: String(err),
        });
        // Mark action as executed so we don't retry it
        this.executedActionKeys.add(bestAction.id);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // KNOWLEDGE STATE ASSESSMENT
  // ═══════════════════════════════════════════════════════════

  private assessKnowledgeState(): string {
    const byType = new Map<string, number>();
    for (const entity of this.graph.getAllEntities()) {
      byType.set(entity.type, (byType.get(entity.type) ?? 0) + 1);
    }

    const avgConfidence = this.graph.computeOverallConfidence();
    const missing = EXPECTED_ENTITY_TYPES.filter((t) => !byType.has(t));

    const parts = Array.from(byType.entries()).map(([t, c]) => `${t}:${c}`);
    return `${this.graph.entityCount} entities [${parts.join(", ")}], avg conf ${Math.round(avgConfidence)}, missing: [${missing.join(", ")}]`;
  }

  // ═══════════════════════════════════════════════════════════
  // CANDIDATE ACTION GENERATION
  // ═══════════════════════════════════════════════════════════

  private generateCandidateActions(cycle: number): PlannerAction[] {
    const actions: PlannerAction[] = [];

    // ── Cycle 0: Seed with SearchAgent ──
    if (cycle === 0) {
      const firstName = this.hints.firstName as string | undefined;
      const lastName = this.hints.lastName as string | undefined;
      if (firstName && lastName) {
        actions.push(this.makeRunAgentAction(
          AGENT_IDS.SEARCH,
          { ...this.hints },
          "Initial search to gather evidence",
          "seed",
        ));
      }
      // If company is known but no name, start with company
      if (!firstName || !lastName) {
        const company = this.hints.company as string | undefined;
        if (company) {
          actions.push(this.makeRunAgentAction(
            AGENT_IDS.COMPANY,
            { companyName: company, ...this.hints },
            "Initial company investigation (no person name available)",
            "seed",
          ));
        }
      }
      return actions;
    }

    // ── Cycle 1: Seed with IdentityAgent (if search evidence exists) ──
    if (cycle === 1 && !this.executedActionKeys.has(`agent:${AGENT_IDS.IDENTITY}`)) {
      const firstName = this.hints.firstName as string | undefined;
      const lastName = this.hints.lastName as string | undefined;
      const searchEvidence = this.hints.searchEvidence as EvidenceRecord[] | undefined;
      if (firstName && lastName) {
        actions.push(this.makeRunAgentAction(
          AGENT_IDS.IDENTITY,
          { ...this.hints, searchEvidence: searchEvidence ?? [] },
          "Resolve person identity from search evidence",
          "seed",
        ));
      }
    }

    // ── Process pending suggestions (run_agent + fetch_page) ──
    for (const suggestion of this.pendingSuggestions) {
      const action = this.suggestionToAction(suggestion);
      if (action && !this.executedActionKeys.has(action.id)) {
        actions.push(action);
      }
    }

    // ── Generate actions for missing entity types ──
    const missingActions = this.generateMissingTypeActions();
    for (const action of missingActions) {
      if (!this.executedActionKeys.has(action.id)) {
        actions.push(action);
      }
    }

    return actions;
  }

  private suggestionToAction(suggestion: PlannerSuggestion): PlannerAction | null {
    if (suggestion.type === "run_agent") {
      const agentId = suggestion.params.agentId as string | undefined;
      if (!agentId) return null;
      return this.makeRunAgentAction(
        agentId,
        { ...this.hints, ...suggestion.params },
        suggestion.rationale,
        "suggestion",
      );
    }

    if (suggestion.type === "fetch_page") {
      const url = suggestion.params.url as string | undefined;
      if (!url) return null;
      return this.makeFetchPageAction(
        url,
        suggestion.params,
        suggestion.rationale,
        "suggestion",
      );
    }

    // 'investigate_entity' and 'search' are handled elsewhere
    return null;
  }

  private generateMissingTypeActions(): PlannerAction[] {
    const actions: PlannerAction[] = [];
    const existingTypes = new Set<EntityType>();
    for (const entity of this.graph.getAllEntities()) {
      existingTypes.add(entity.type);
    }

    const firstName = this.hints.firstName as string | undefined;
    const lastName = this.hints.lastName as string | undefined;
    const personEntityId = this.hints.personEntityId as string | undefined;
    const company = this.hints.company as string | undefined;
    const companyName = (this.hints.companyName as string | undefined) ?? company;

    // Missing social profiles → SocialAgent (the only agent wired to Apify
    // enrichment). Gated on a *matched* profile, not mere type presence:
    // WebsiteAgent creates low-confidence "social_profile" entities as a
    // side effect of scraping any page (footer "follow us" links on an
    // unrelated news site, or a link found while it directly page-fetches
    // a social URL as a generic page). Those carry the name-match
    // confidence computed in website-agent.ts/social-agent.ts (~12-20 for
    // no/weak match, ~43+ for a real match) — gating on that value instead
    // of raw presence stops one junk footer link from permanently starving
    // SocialAgent out of every cycle that follows.
    // A matched profile alone isn't enough to skip SocialAgent: if it's
    // instagram/facebook and still missing the Apify enrichment fields
    // (followers), SocialAgent needs to run again to pick it up from the
    // graph and enrich it (see the matching block added in social-agent.ts) —
    // otherwise a real profile found by WebsiteAgent's link-extraction would
    // permanently block the only agent wired to Apify from ever enriching it.
    const matchedSocialProfiles = this.graph
      .getEntitiesByType("social_profile")
      .filter((e) => e.confidence >= 40);
    const needsApifyEnrichment = matchedSocialProfiles.some((e) => {
      const props = e.properties as { platform?: string; followers?: number };
      return (
        (props.platform === "instagram" || props.platform === "facebook") &&
        typeof props.followers !== "number"
      );
    });
    const hasMatchedSocialProfile = matchedSocialProfiles.length > 0 && !needsApifyEnrichment;
    if (!hasMatchedSocialProfile && firstName && lastName && personEntityId) {
      actions.push(this.makeRunAgentAction(
        AGENT_IDS.SOCIAL,
        { firstName, lastName, company, personEntityId },
        "No social profiles found yet",
        "missing_type",
      ));
    }

    // Missing phone → PhoneAgent
    if (!existingTypes.has("phone") && firstName && lastName && personEntityId) {
      actions.push(this.makeRunAgentAction(
        AGENT_IDS.PHONE,
        { firstName, lastName, company, locality: this.hints.locality, personEntityId },
        "No phone numbers found yet",
        "missing_type",
      ));
    }

    // Missing email → EmailAgent
    if (!existingTypes.has("email") && firstName && lastName && personEntityId) {
      actions.push(this.makeRunAgentAction(
        AGENT_IDS.EMAIL,
        { firstName, lastName, company, domain: this.hints.domain, personEntityId },
        "No email addresses found yet",
        "missing_type",
      ));
    }

    // Missing company → CompanyAgent
    if (!existingTypes.has("company") && companyName) {
      actions.push(this.makeRunAgentAction(
        AGENT_IDS.COMPANY,
        { companyName, personEntityId },
        "No company entity found yet",
        "missing_type",
      ));
    }

    // Missing news → NewsAgent
    if (!existingTypes.has("news_item") && (companyName || (firstName && lastName))) {
      actions.push(this.makeRunAgentAction(
        AGENT_IDS.NEWS,
        {
          companyName,
          personName: firstName && lastName ? `${firstName} ${lastName}` : undefined,
          companyEntityId: this.hints.companyEntityId,
          personEntityId,
        },
        "No news articles found yet",
        "missing_type",
      ));
    }

    return actions;
  }

  // ═══════════════════════════════════════════════════════════
  // EIG SCORING
  // ═══════════════════════════════════════════════════════════

  private scoreActions(actions: PlannerAction[]): PlannerAction[] {
    const discoveryProbabilities = strategyOptimizer.getDiscoveryProbabilitiesSync();
    
    for (const action of actions) {
      // Base discovery probability from strategy optimizer
      let discoveryProb = discoveryProbabilities[action.agentId] ?? 0.5;

      // Diminishing returns for repeat invocations
      const agentRunCount = Array.from(this.executedActionKeys)
        .filter((key) => key.startsWith(`agent:${action.agentId}`)).length;
      if (agentRunCount > 0) {
        discoveryProb *= Math.pow(0.3, agentRunCount);
      }

      // Boost if targeting a missing entity type
      const agentEntityTypes = this.getAgentEntityTypes(action.agentId);
      const existingTypes = new Set(this.graph.getAllEntities().map((e) => e.type));
      const missingTargetTypes = agentEntityTypes.filter((t) => !existingTypes.has(t));
      if (missingTargetTypes.length > 0) {
        discoveryProb = Math.min(0.95, discoveryProb + 0.15);
      }

      // Expected fields: capabilities not yet fulfilled
      const unfulfilledFields = this.getUnfulfilledFields(action.agentId);

      // EIG = (expectedFields × discoveryProbability) / (estimatedQueries + 1)
      action.discoveryProbability = discoveryProb;
      action.expectedFields = unfulfilledFields;
      action.eig = (unfulfilledFields.length * discoveryProb) / (action.estimatedQueries + 1);

      // Floor for SocialAgent's gate-driven action (source "missing_type",
      // see generateMissingTypeActions): every "fetch_page" suggestion's EIG
      // is computed from WebsiteAgent's *entire* capability list (5 fields),
      // regardless of whether that specific URL could plausibly deliver any
      // of them — so a pile of speculative page fetches (a YouTube video, a
      // Wikipedia mirror) each scores ~0.7 and structurally outranks the one
      // targeted, near-certain action (a known profile URL, 1 query, real
      // Apify payoff) at ~0.36. Observed directly in a live run's
      // audit_trail_json: fetch_page candidates at 0.7 beat agent:social at
      // 0.36 for all 8 cycles, so SocialAgent never got to run despite being
      // the correct next step every single cycle. Rather than redesign the
      // whole EIG model (which scores fetch_page off the owning agent's
      // aggregate capabilities, not the specific URL), floor this one
      // deterministic, cheap, gate-vetted action so it isn't drowned out by
      // speculative ones.
      if (action.agentId === AGENT_IDS.SOCIAL && action.source === "missing_type") {
        action.eig = Math.max(action.eig, 1.0);
      }
    }

    // Sort by EIG descending
    return actions.sort((a, b) => b.eig - a.eig);
  }

  private getAgentEntityTypes(agentId: string): EntityType[] {
    const map: Record<string, EntityType[]> = {
      [AGENT_IDS.SEARCH]: [],
      [AGENT_IDS.IDENTITY]: ["person"],
      [AGENT_IDS.COMPANY]: ["company", "domain", "website"],
      [AGENT_IDS.SOCIAL]: ["social_profile"],
      [AGENT_IDS.PHONE]: ["phone"],
      [AGENT_IDS.EMAIL]: ["email"],
      [AGENT_IDS.NEWS]: ["news_item"],
      [AGENT_IDS.WEBSITE]: ["website", "social_profile"],
    };
    return map[agentId] ?? [];
  }

  private getUnfulfilledFields(agentId: string): EntityField[] {
    const agent = this.registry.get(agentId);
    if (!agent) return [];

    return agent.capabilities.filter((field) => !this.isFieldFulfilled(field));
  }

  private isFieldFulfilled(field: EntityField): boolean {
    switch (field) {
      case "person.linkedin":
      case "person.twitter":
      case "person.instagram":
      case "person.facebook":
      case "person.github": {
        const platform = field.split(".")[1] as string;
        return this.graph.getEntitiesByType("social_profile").some((e) => {
          const props = e.properties as { platform?: string; followers?: number };
          if (props.platform !== platform) return false;
          // instagram/facebook aren't "fulfilled" by URL discovery alone —
          // Apify enrichment (followers/bio/etc, see social-agent.ts) is
          // the actual payoff. Without this, EIG scoring sees the field as
          // already satisfied the moment WebsiteAgent finds the link, so
          // SocialAgent's action (generated by generateMissingTypeActions
          // for exactly this "needs enrichment" case) scores near-zero EIG
          // and never wins against the other pending actions.
          if (platform === "instagram" || platform === "facebook") {
            return typeof props.followers === "number";
          }
          return true;
        });
      }
      case "person.phone":
        return this.graph.getEntitiesByType("phone").length > 0;
      case "person.email":
        return this.graph.getEntitiesByType("email").length > 0;
      case "person.company":
        return this.graph.getEntitiesByType("company").length > 0;
      case "person.position":
        return this.graph.getEntitiesByType("position").length > 0;
      case "person.location":
        return this.graph.getEntitiesByType("address").length > 0;
      case "person.profession": {
        const persons = this.graph.getEntitiesByType("person");
        return persons.some((e) => {
          const props = e.properties as PersonProperties;
          return !!props.profession;
        });
      }
      case "company.website":
        return this.graph.getEntitiesByType("website").length > 0;
      case "company.industry": {
        const companies = this.graph.getEntitiesByType("company");
        return companies.some((e) => {
          const props = e.properties as CompanyProperties;
          return !!props.industry;
        });
      }
      case "company.size": {
        const companies = this.graph.getEntitiesByType("company");
        return companies.some((e) => {
          const props = e.properties as CompanyProperties;
          return !!props.size;
        });
      }
      case "company.news":
        return this.graph.getEntitiesByType("news_item").length > 0;
      case "company.competitors":
        return this.graph.getRelations().some((r) => r.type === "COMPETITOR_OF");
      default:
        return false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ACTION EXECUTION
  // ═══════════════════════════════════════════════════════════

  /**
   * Races executeAction() against the investigation's remaining time
   * budget. Without this, a single slow action (e.g. SocialAgent enriching
   * several profiles via Apify, each up to 60s) could block the loop past
   * maxDurationMs — the budget check at the top of runAdaptiveLoop() only
   * runs *between* cycles, so it never caught an action already in flight.
   * Confirmed in testing: one run blew a 60s budget by 5x+ (330s) this way.
   *
   * This bounds how long the *loop* waits, not how long the action itself
   * runs — providers are called via plain fetch with no AbortController
   * threaded through, so a timed-out action keeps running in the
   * background until it naturally finishes (or its own provider-level
   * timeout fires). That's a real limitation, not a full fix, but it's
   * enough to guarantee the investigation as a whole returns within its
   * configured budget instead of hanging on whatever the slowest agent
   * happens to do.
   */
  private async executeActionWithTimeout(action: PlannerAction, timeoutMs: number): Promise<void> {
    const actionPromise = this.executeAction(action);

    // Attach a no-op catch so a late failure from the orphaned execution
    // (still running after we've already moved on) doesn't surface as an
    // unhandled promise rejection.
    actionPromise.catch((err) => {
      this.ctx.logger.warn("Action failed after its budget timeout had already elapsed", {
        actionId: action.id,
        agentId: action.agentId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Action ${action.id} (${action.agentId}) exceeded remaining time budget (${timeoutMs}ms)`)),
        timeoutMs,
      );
    });

    try {
      await Promise.race([actionPromise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private async executeAction(action: PlannerAction): Promise<void> {
    this.executedActionKeys.add(action.id);

    const agent = this.registry.get(action.agentId);
    if (!agent) {
      this.ctx.logger.warn("Agent not found in registry", { agentId: action.agentId });
      return;
    }

    const input: AgentInput = {
      targetId: (this.hints.clientId as string) ?? "unknown",
      // Merge the investigation-wide hints (firstName/lastName/company/...)
      // under the action-specific ones — agents like WebsiteAgent only ever
      // received the fetch_page suggestion's own params before, with no
      // way to know whose name to match extracted social links against.
      hints: { ...this.hints, ...action.hints },
    };

    const output = await agent.run(input, this.ctx);

    // Track metrics
    this.queriesExecuted += output.metrics.queriesExecuted;
    this.cacheHits += output.metrics.cacheHits;
    this.estimatedCostFromMetrics(output.metrics.providersUsed);

    for (const providerId of output.metrics.providersUsed) {
      this.ensureProviderStats(providerId);
      this.providerStats[providerId].requestsSent++;
      this.providerStats[providerId].successes++;
    }
    for (const providerId of output.metrics.providersFailed) {
      this.ensureProviderStats(providerId);
      this.providerStats[providerId].requestsSent++;
      this.providerStats[providerId].failures++;
    }

    // Merge output into graph
    this.mergeAgentOutput(output);

    // Update hints with new context
    this.updateHintsFromOutput(output);

    // Score entities
    this.confidenceEngine.scoreAndUpdateEntities(this.graph.getAllEntities());

    // Remove processed suggestions from pending list
    // (suggestions that were the source of this action)
    if (action.source === "suggestion") {
      this.pendingSuggestions = this.pendingSuggestions.filter(
        (s) => !(s.type === action.type && s.rationale === action.rationale),
      );
    }

    // Add new suggestions to pending
    for (const suggestion of output.suggestions) {
      this.pendingSuggestions.push(suggestion);
    }

    this.ctx.logger.info("Agent output merged", {
      agentId: action.agentId,
      entities: output.entities.length,
      relations: output.relations.length,
      evidence: output.evidence.length,
      suggestions: output.suggestions.length,
      pendingSuggestions: this.pendingSuggestions.length,
    });
  }

  private mergeAgentOutput(output: AgentOutput): void {
    // Add entities (graph handles dedup via natural keys)
    for (const entity of output.entities) {
      this.graph.addEntity(entity);
    }

    // Add relations
    for (const relation of output.relations) {
      this.graph.addRelation(relation);
    }

    // Add evidence
    for (const evidence of output.evidence) {
      this.graph.addEvidence(evidence);
    }
  }

  private updateHintsFromOutput(output: AgentOutput): void {
    // Person entity
    const person = output.entities.find((e) => e.type === "person");
    if (person) {
      this.hints.personEntityId = person.id;
      const props = person.properties as PersonProperties;
      if (props.profession) this.hints.profession = props.profession;
      if (props.locality) this.hints.locality = props.locality;
    }

    // Company entity
    const company = output.entities.find((e) => e.type === "company");
    if (company) {
      this.hints.companyEntityId = company.id;
      const props = company.properties as CompanyProperties;
      this.hints.companyName = props.name;
      this.hints.company = props.name;
    }

    // Domain entity
    const domain = output.entities.find((e) => e.type === "domain");
    if (domain) {
      const props = domain.properties as DomainProperties;
      this.hints.domain = props.domain;
    }

    // Website entity
    const website = output.entities.find((e) => e.type === "website");
    if (website) {
      const props = website.properties as WebsiteProperties;
      this.hints.websiteUrl = props.url;
    }

    // Search evidence (for IdentityAgent)
    if (output.evidence.length > 0 && !this.hints.searchEvidence) {
      this.hints.searchEvidence = output.evidence;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // INVESTIGATE_ENTITY SUGGESTION PROCESSING
  // Creates entities directly from found data (email, phone)
  // ═══════════════════════════════════════════════════════════

  private processInvestigateEntitySuggestions(): void {
    const remaining: PlannerSuggestion[] = [];

    for (const suggestion of this.pendingSuggestions) {
      if (suggestion.type !== "investigate_entity") {
        remaining.push(suggestion);
        continue;
      }

      const email = suggestion.params.email as string | undefined;
      const phone = suggestion.params.phone as string | undefined;
      const sourceUrl = suggestion.params.sourceUrl as string | undefined;
      const sourceDomain = sourceUrl ? this.extractDomainSafe(sourceUrl) : "unknown";

      if (email) {
        this.createEmailEntity(email, sourceUrl, sourceDomain);
      }

      if (phone) {
        this.createPhoneEntity(phone, sourceUrl, sourceDomain);
      }

      // Social profile suggestions with entityId are already created by WebsiteAgent
      // Just skip them
    }

    this.pendingSuggestions = remaining;
  }

  private createEmailEntity(rawEmail: string, sourceUrl: string | undefined, sourceDomain: string): void {
    const address = normalizeEmail(rawEmail);
    if (!address) return;

    // Finding a page that mentions the client's OWN already-known email is
    // a real confirmation the page is about them — a much stronger signal
    // than "some email address appeared on some page we fetched", which is
    // all the flat confidence of 55 used to represent regardless of source.
    const knownEmail = normalizeEmail((this.hints.email as string | undefined) ?? "");
    const isConfirmation = !!knownEmail && knownEmail === address;
    const confidence = isConfirmation ? 90 : 55;

    const dom = emailDomain(address);
    const props: EmailProperties = {
      address,
      domain: dom,
      isCorporate: isCorporateEmail(address),
      isDisposable: false,
      isVerified: false,
    };

    const entity = this.makeEntity("email", props, confidence);
    this.graph.addEntity(entity);

    // Link to person
    const personId = this.hints.personEntityId as string | undefined;
    if (personId) {
      this.graph.addRelation(this.makeRelation("HAS_EMAIL", personId, entity.id, confidence));
    }

    // Create evidence
    const evidence = this.makeEvidence(
      sourceUrl ?? "unknown", sourceDomain,
      "corporate_site", "page_fetcher",
      `Email found on website: ${address}`,
      `Extracted email: ${address}`,
      ["email_extraction"],
      entity.id,
    );
    this.graph.addEvidence(evidence);

    entity.evidence.push({
      evidenceId: evidence.id,
      sourceDomain,
      provider: "page_fetcher",
      matchType: "exact_email",
    });
  }

  private createPhoneEntity(rawPhone: string, sourceUrl: string | undefined, sourceDomain: string): void {
    const digits = digitsOnly(rawPhone);
    if (digits.length < 8 || digits.length > 15) return;

    // Same reasoning as createEmailEntity: a match against the client's
    // own already-known phone is a real confirmation, not just "some
    // digit run appeared somewhere".
    const knownDigits = digitsOnly((this.hints.phone as string | undefined) ?? "");
    const isConfirmation = knownDigits.length >= 8 && (digits.includes(knownDigits) || knownDigits.includes(digits));
    const confidence = isConfirmation ? 85 : 50;

    const props: PhoneProperties = {
      raw: rawPhone,
      digits,
      country: digits.startsWith("54") ? "AR" : "unknown",
      variants: [rawPhone, digits],
      type: "unknown",
    };

    const entity = this.makeEntity("phone", props, confidence);
    this.graph.addEntity(entity);

    // Link to person
    const personId = this.hints.personEntityId as string | undefined;
    if (personId) {
      this.graph.addRelation(this.makeRelation("HAS_PHONE", personId, entity.id, confidence));
    }

    // Create evidence
    const evidence = this.makeEvidence(
      sourceUrl ?? "unknown", sourceDomain,
      "corporate_site", "page_fetcher",
      `Phone found on website: ${rawPhone}`,
      `Extracted phone: ${digits}`,
      ["phone_extraction"],
      entity.id,
    );
    this.graph.addEvidence(evidence);

    entity.evidence.push({
      evidenceId: evidence.id,
      sourceDomain,
      provider: "page_fetcher",
      matchType: "exact_phone",
    });
  }

  // ═══════════════════════════════════════════════════════════
  // AUDIT TRAIL
  // ═══════════════════════════════════════════════════════════

  private recordDecision(
    cycle: number,
    knowledgeState: string,
    candidates: PlannerAction[],
    selected: PlannerAction | null,
  ): void {
    const decision: PlannerDecision = {
      runId: this.runId,
      cycle,
      knowledgeState,
      candidateActions: candidates.slice(0, 10).map((a) => ({
        action: a.id,
        eig: Math.round(a.eig * 1000) / 1000,
      })),
      selectedAction: selected?.id ?? "none",
      rationale: selected?.rationale ?? "No actionable candidates",
      timestamp: new Date().toISOString(),
    };
    this.auditTrail.push(decision);

    this.ctx.logger.debug("Planner decision", {
      cycle,
      candidates: candidates.length,
      selected: decision.selectedAction,
      eig: selected?.eig ?? 0,
      knowledgeState,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // FINALIZATION
  // ═══════════════════════════════════════════════════════════

  private async finalize(
    status: InvestigationResult["status"],
    request: InvestigationRequest,
  ): Promise<InvestigationResult> {
    const totalDurationMs = Date.now() - this.startTime;

    // Final confidence scoring + learning
    const { avgScore, providerOutcomes } = this.confidenceEngine.scoreAndLearn(
      this.graph.getAllEntities(),
    );

    // Determine final status
    let finalStatus = status;
    if (status === "completed") {
      if (this.queriesExecuted >= this.config.maxQueries) {
        finalStatus = "partial";
      } else if (totalDurationMs > this.config.maxDurationMs) {
        finalStatus = "timeout";
      } else if (this.graph.getEntitiesByType("person").length === 0) {
        finalStatus = "partial";
      }
    }

    // Set CRM client ID on entities for future memory recall
    this.graph.setCrmClientId(request.clientId);

    // Persist graph to DB
    try {
      await this.graph.persistToStore(this.store);
    } catch (err) {
      this.ctx.logger.error("Failed to persist graph", { error: String(err) });
    }

    // Build profile views
    const personEntity = this.graph.getEntitiesByType("person")[0];
    const personProfile: PersonProfileView | null = personEntity
      ? this.graph.buildPersonProfileView(personEntity.id)
      : null;

    const companyEntity = this.graph.getEntitiesByType("company")[0];
    const companyProfile: CompanyProfileView | null = companyEntity
      ? this.graph.buildCompanyProfileView(companyEntity.id)
      : null;

    // Identity verified if person confidence >= autoUpdateCrm threshold
    const identityVerified = personEntity
      ? personEntity.confidence >= this.config.confidenceThresholds.autoUpdateCrm
      : false;

    // Build run metrics
    const metrics = this.buildRunMetrics(totalDurationMs, avgScore, identityVerified, providerOutcomes);

    // Complete run in DB
    try {
      await this.store.completeRun(this.runId, {
        status: finalStatus,
        cyclesExecuted: this.auditTrail.length,
        durationMs: totalDurationMs,
        metrics,
        auditTrail: this.auditTrail,
      });
    } catch (err) {
      this.ctx.logger.error("Failed to complete run", { error: String(err) });
    }

    this.ctx.logger.info("Investigation complete", {
      status: finalStatus,
      durationMs: totalDurationMs,
      cycles: this.auditTrail.length,
      entities: this.graph.entityCount,
      avgConfidence: Math.round(avgScore * 100) / 100,
      identityVerified,
    });

    // Build result (personProfile is guaranteed by type, but may be empty)
    if (!personProfile) {
      // Create a minimal person profile view
      return this.buildFailedResult(request, "No person entity was created");
    }

    return {
      runId: this.runId,
      status: finalStatus,
      durationMs: totalDurationMs,
      cyclesExecuted: this.auditTrail.length,
      personProfile,
      companyProfile,
      overallConfidence: Math.round(avgScore * 100) / 100,
      identityVerified,
      aiInsights: null, // Phase 5+
      metrics,
      auditTrail: this.auditTrail,
    };
  }

  private buildRunMetrics(
    totalDurationMs: number,
    avgConfidence: number,
    identityVerified: boolean,
    providerOutcomes: Record<string, { useful: number; useless: number }>,
  ): RunMetrics {
    // Build provider stats
    const providers: RunMetrics["providers"] = {};
    for (const [providerId, stats] of Object.entries(this.providerStats)) {
      const outcomes = providerOutcomes[providerId] ?? { useful: 0, useless: 0 };
      const totalResults = stats.successes;
      providers[providerId] = {
        requestsSent: stats.requestsSent,
        successes: stats.successes,
        failures: stats.failures,
        rateLimited: 0,
        cacheHits: stats.cacheHits,
        avgLatencyMs: 0,
        usefulResults: outcomes.useful,
        usefulnessRate: totalResults > 0 ? outcomes.useful / totalResults : 0,
        costUsd: 0,
      };
    }

    const fieldCoverage = this.computeFieldCoverage();

    return {
      pipeline: {
        totalDurationMs,
        stageTimings: this.stageTimings,
        cyclesExecuted: this.auditTrail.length,
      },
      providers,
      quality: {
        identityVerified,
        avgConfidence: Math.round(avgConfidence * 100) / 100,
        fieldCoverage,
        conflictsDetected: 0,
      },
      cost: {
        totalUsd: Math.round(this.costUsd * 10000) / 10000,
        aiTokensUsed: 0,
        queriesFromCache: this.cacheHits,
        cacheSavingsUsd: 0,
      },
    };
  }

  private computeFieldCoverage(): number {
    const allFields: EntityField[] = [
      "person.linkedin", "person.twitter", "person.instagram",
      "person.phone", "person.email", "person.company", "person.position",
      "person.location", "person.profession",
      "company.website", "company.industry", "company.news",
    ];
    const fulfilled = allFields.filter((f) => this.isFieldFulfilled(f));
    return Math.round((fulfilled.length / allFields.length) * 100);
  }

  private buildFailedResult(
    request: InvestigationRequest,
    errorMessage: string,
  ): InvestigationResult {
    const emptyPerson: PersonProfileView = {
      person: {
        id: "none",
        type: "person",
        properties: {
          firstName: "",
          lastName: "",
          fullName: "",
          normalizedFullName: "",
        } as PersonProperties,
        confidence: 0,
        confidenceFactors: {
          sourceReliability: 0, corroboration: 0,
          specificity: 0, recency: 0, consistency: 0,
        },
        evidence: [],
        firstSeenAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        lastUpdatedByRunId: this.runId ?? "failed",
      },
      socialProfiles: [],
      phone: null,
      email: null,
      position: null,
      company: null,
      address: null,
      newsItems: [],
    };

    const metrics: RunMetrics = {
      pipeline: {
        totalDurationMs: Date.now() - this.startTime,
        stageTimings: {},
        cyclesExecuted: 0,
      },
      providers: {},
      quality: {
        identityVerified: false,
        avgConfidence: 0,
        fieldCoverage: 0,
        conflictsDetected: 0,
      },
      cost: {
        totalUsd: 0,
        aiTokensUsed: 0,
        queriesFromCache: 0,
        cacheSavingsUsd: 0,
      },
    };

    rootLogger.error("Investigation failed", { errorMessage, clientId: request.clientId });

    return {
      runId: this.runId ?? `failed_${Date.now()}`,
      status: "failed",
      durationMs: Date.now() - this.startTime,
      cyclesExecuted: 0,
      personProfile: emptyPerson,
      companyProfile: null,
      overallConfidence: 0,
      identityVerified: false,
      aiInsights: null,
      metrics,
      auditTrail: [],
    };
  }

  // ═══════════════════════════════════════════════════════════
  // ACTION FACTORY HELPERS
  // ═══════════════════════════════════════════════════════════

  private makeRunAgentAction(
    agentId: string,
    hints: Record<string, unknown>,
    rationale: string,
    source: string,
  ): PlannerAction {
    const estimatedQueries = AGENT_ESTIMATED_QUERIES[agentId] ?? 2;
    return {
      id: `agent:${agentId}:${this.hashHints(hints)}`,
      type: "run_agent",
      agentId,
      hints,
      expectedFields: [],
      estimatedQueries,
      estimatedCost: 0,
      discoveryProbability: strategyOptimizer.getDiscoveryProbabilitiesSync()[agentId] ?? 0.5,
      eig: 0, // Computed in scoreActions
      rationale,
      source,
    };
  }

  private makeFetchPageAction(
    url: string,
    params: Record<string, unknown>,
    rationale: string,
    source: string,
  ): PlannerAction {
    return {
      id: `fetch:${url}`,
      type: "fetch_page",
      agentId: AGENT_IDS.WEBSITE,
      hints: {
        ...this.hints,
        url,
        entityId: params.entityId,
        companyEntityId: params.companyEntityId ?? this.hints.companyEntityId,
        personEntityId: params.personEntityId ?? this.hints.personEntityId,
      },
      expectedFields: [],
      estimatedQueries: 1,
      estimatedCost: 0,
      discoveryProbability: 0.7,
      eig: 0,
      rationale,
      source,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // ENTITY / RELATION / EVIDENCE FACTORY (mirrors BaseAgent)
  // ═══════════════════════════════════════════════════════════

  private makeEntity(
    type: EntityType,
    properties: EntityProperties,
    confidence: number = 0,
  ): GraphEntity {
    const now = new Date().toISOString();
    return {
      id: `${type}_${this.runId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      properties,
      confidence,
      confidenceFactors: {
        sourceReliability: 0,
        corroboration: 0,
        specificity: 0,
        recency: 1,
        consistency: 0,
      },
      evidence: [],
      firstSeenAt: now,
      lastVerifiedAt: now,
      lastUpdatedByRunId: this.runId,
    };
  }

  private makeRelation(
    type: RelationType,
    sourceId: string,
    targetId: string,
    confidence: number = 0,
  ): GraphRelation {
    const now = new Date().toISOString();
    return {
      id: `${type}_${sourceId}_${targetId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      sourceId,
      targetId,
      properties: {},
      confidence,
      confidenceFactors: {
        sourceReliability: 0,
        corroboration: 0,
        specificity: 0,
        recency: 1,
        consistency: 0,
      },
      evidence: [],
      firstSeenAt: now,
      lastVerifiedAt: now,
      lastUpdatedByRunId: this.runId,
    };
  }

  private makeEvidence(
    sourceUrl: string,
    sourceDomain: string,
    sourceType: SourceType,
    provider: string,
    title: string,
    snippet: string,
    matchReasons: string[] = [],
    entityId?: string,
  ): EvidenceRecord {
    return {
      id: `ev_${this.runId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      runId: this.runId,
      entityId,
      sourceDomain,
      sourceUrl,
      sourceType,
      provider,
      title,
      snippet,
      matchReasons,
      extractedAt: new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // UTILITY HELPERS
  // ═══════════════════════════════════════════════════════════

  private hashHints(hints: Record<string, unknown>): string {
    // Simple hash of key hint values for action dedup
    const keys = Object.keys(hints).sort();
    const parts = keys.map((k) => `${k}=${String(hints[k]).slice(0, 50)}`);
    const str = parts.join("|");
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  private extractDomainSafe(url: string): string {
    try {
      const u = new URL(url);
      return u.hostname;
    } catch {
      return url.slice(0, 100);
    }
  }

  private ensureProviderStats(providerId: string): void {
    if (!this.providerStats[providerId]) {
      this.providerStats[providerId] = {
        requestsSent: 0,
        successes: 0,
        failures: 0,
        cacheHits: 0,
        usefulResults: 0,
      };
    }
  }

  private estimatedCostFromMetrics(providersUsed: string[]): void {
    // Estimate cost based on provider configs
    for (const providerId of providersUsed) {
      const providerConfig = this.config.providers[providerId];
      if (providerConfig?.costPerRequestUsd) {
        this.costUsd += providerConfig.costPerRequestUsd;
      }
    }
  }
}
