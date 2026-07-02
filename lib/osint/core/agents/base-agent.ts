// ============================================================
// OSINT Intelligence Platform — Base Agent + Agent Context
// ============================================================
// All specialized agents extend BaseAgent. It provides:
//   - Access to shared services (graph, store, providers, confidence)
//   - Helper methods for creating entities, relations, evidence
//   - Lifecycle management (timing, error handling, metrics)
// ============================================================

import type {
  AgentInput,
  AgentOutput,
  AgentMetrics,
  GraphEntity,
  GraphRelation,
  EvidenceRecord,
  EvidenceRef,
  ConfidenceFactors,
  EntityType,
  EntityProperties,
  RelationType,
  SignalType,
  SourceType,
  ProviderQuery,
  ProviderResult,
  ProviderCapability,
  PlannerSuggestion,
  EntityField,
  OsintConfig,
} from "../types";

import type { KnowledgeGraph } from "../persistence/knowledge-graph";
import type { GraphStore } from "../persistence/graph-store";
import type { ProviderRegistry } from "../providers/provider.registry";
import type { ConfidenceEngine } from "../confidence/confidence-engine";
import type { MemoryStore } from "../memory/memory-store";
import type { StructuredLogger } from "../observability/logger";

// ─────────────────────────────────────────────────────────────
// Agent Context — shared services available to all agents
// ─────────────────────────────────────────────────────────────

export interface AgentContext {
  graph: KnowledgeGraph;
  store: GraphStore;
  providers: ProviderRegistry;
  confidenceEngine: ConfidenceEngine;
  memoryStore: MemoryStore;
  logger: StructuredLogger;
  config: OsintConfig;
  runId: string;
  traceId: string;
}

// ─────────────────────────────────────────────────────────────
// Agent Interface
// ─────────────────────────────────────────────────────────────

export interface OsintAgent {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly EntityField[];
  run(input: AgentInput, ctx: AgentContext): Promise<AgentOutput>;
}

// ─────────────────────────────────────────────────────────────
// Base Agent
// ─────────────────────────────────────────────────────────────

export abstract class BaseAgent implements OsintAgent {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly capabilities: readonly EntityField[];

  /**
   * Subclasses implement this. It contains the agent's
   * specialized logic (search, parse, extract).
   */
  protected abstract execute(
    input: AgentInput,
    ctx: AgentContext,
  ): Promise<AgentOutput>;

  /**
   * Public entry point — wraps execute() with timing and
   * error handling. Always returns a valid AgentOutput.
   */
  async run(input: AgentInput, ctx: AgentContext): Promise<AgentOutput> {
    const start = Date.now();
    const agentLogger = ctx.logger.child({ agentId: this.id });

    try {
      const output = await this.execute(input, ctx);

      // Ensure metrics are filled
      output.metrics = {
        agentId: this.id,
        durationMs: Date.now() - start,
        queriesExecuted: output.metrics?.queriesExecuted ?? 0,
        cacheHits: output.metrics?.cacheHits ?? 0,
        providersUsed: output.metrics?.providersUsed ?? [],
        providersFailed: output.metrics?.providersFailed ?? [],
        tokensUsed: output.metrics?.tokensUsed ?? 0,
        resultsFound: output.entities.length,
      };

      agentLogger.info("Agent completed", {
        durationMs: output.metrics.durationMs,
        entitiesFound: output.entities.length,
        relationsFound: output.relations.length,
        evidenceFound: output.evidence.length,
        suggestionsGenerated: output.suggestions.length,
      });

      return output;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      agentLogger.error("Agent failed", { error: errorMsg });

      return {
        entities: [],
        relations: [],
        evidence: [],
        suggestions: [],
        metrics: {
          agentId: this.id,
          durationMs: Date.now() - start,
          queriesExecuted: 0,
          cacheHits: 0,
          providersUsed: [],
          providersFailed: [],
          tokensUsed: 0,
          resultsFound: 0,
        },
      };
    }
  }

  // ── Provider Search Helper ──

  /**
   * Execute a search using the new SMART PROVIDER SELECTION system.
   * Automatically selects the best provider based on scoring, with fallback chain.
   */
  protected async searchProviders(
    query: ProviderQuery,
    capability: ProviderCapability,
    ctx: AgentContext,
  ): Promise<{ results: ProviderResult[]; cacheHit: boolean; providersUsed: string[] }> {
    // Check cache first
    if (ctx.config.enableCache) {
      const cacheKey = `${capability}:${query.text}:${JSON.stringify(query.options || {})}`;
      const cached = await ctx.store.getCachedSearch(cacheKey);
      if (cached && cached.length > 0) {
        ctx.logger.debug("Cache hit for search query", { cacheKey, resultCount: cached.length });
        return { results: cached, cacheHit: true, providersUsed: [] };
      }
    }

    try {
      // Use the new smart provider selection with automatic fallback
      const execution = await ctx.providers.executeWithFallback(query, {
        capability,
        maxLatency: 10000, // 10s max
        minReliability: 60, // Minimum 60% reliability
        budget: 0.01 // $0.01 max per query
      });

      // Cache successful results
      if (ctx.config.enableCache && execution.results.length > 0) {
        const cacheKey = `${capability}:${query.text}:${JSON.stringify(query.options || {})}`;
        await ctx.store.setCachedSearch(
          execution.executedProvider,
          query.text,
          execution.results,
          ctx.config.cacheTtlDays,
          query.options as Record<string, unknown>
        );
      }

      ctx.logger.info("Smart provider search completed", {
        capability,
        query: query.text,
        executedProvider: execution.executedProvider,
        resultCount: execution.results.length,
        fallbacksUsed: execution.fallbacksUsed,
        totalExecutions: execution.executionResults.length
      });

      return {
        results: execution.results,
        cacheHit: false,
        providersUsed: [execution.executedProvider]
      };

    } catch (error) {
      // Fallback to legacy system if smart selection fails
      ctx.logger.warn("Smart provider selection failed, falling back to legacy", { 
        error: error instanceof Error ? error.message : String(error)
      });
      
      return this.legacySearchProviders(query, capability, ctx);
    }
  }

  /**
   * Legacy provider search method as fallback
   */
  private async legacySearchProviders(
    query: ProviderQuery,
    capability: ProviderCapability,
    ctx: AgentContext,
  ): Promise<{ results: ProviderResult[]; cacheHit: boolean; providersUsed: string[] }> {
    const providers = ctx.providers.getHealthy(capability);
    const providersUsed: string[] = [];
    const allResults: ProviderResult[] = [];

    // Query providers using old method
    for (const provider of providers.slice(0, 2)) { // Limit to top 2 to avoid overuse
      const providerCtx = ctx.providers.getContext(provider.id);
      if (!providerCtx) continue;

      try {
        const results = await provider.search(query, providerCtx);
        allResults.push(...results);
        providersUsed.push(provider.id);

        // Cache the results
        if (ctx.config.enableCache) {
          await ctx.store.setCachedSearch(
            provider.id,
            query.text,
            results,
            ctx.config.cacheTtlDays,
            query.options as Record<string, unknown>,
          );
        }
        
        // Break after first successful provider in legacy mode
        if (results.length > 0) break;
        
      } catch (error) {
        providersUsed.push(provider.id);
        ctx.logger.debug("Legacy provider failed", { 
          providerId: provider.id, 
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return { results: allResults, cacheHit: false, providersUsed };
  }

  // ── Entity Factory Helpers ──

  protected makeEntity(
    type: EntityType,
    properties: EntityProperties,
    runId: string,
    confidence: number = 0,
    factors?: ConfidenceFactors,
  ): GraphEntity {
    const now = new Date().toISOString();
    return {
      id: `${type}_${runId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      properties,
      confidence,
      confidenceFactors: factors ?? {
        sourceReliability: 0,
        corroboration: 0,
        specificity: 0,
        recency: 1,
        consistency: 0,
      },
      evidence: [],
      firstSeenAt: now,
      lastVerifiedAt: now,
      lastUpdatedByRunId: runId,
    };
  }

  protected makeRelation(
    type: RelationType,
    sourceId: string,
    targetId: string,
    runId: string,
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
      lastUpdatedByRunId: runId,
    };
  }

  protected makeEvidence(
    runId: string,
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
      id: `ev_${runId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      runId,
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

  protected makeEvidenceRef(
    evidenceId: string,
    sourceDomain: string,
    provider: string,
    matchType: SignalType,
  ): EvidenceRef {
    return { evidenceId, sourceDomain, provider, matchType };
  }

  protected makeSuggestion(
    type: PlannerSuggestion["type"],
    priority: PlannerSuggestion["priority"],
    rationale: string,
    params: Record<string, unknown>,
    expectedField?: EntityField,
  ): PlannerSuggestion {
    return { type, priority, rationale, params, expectedField };
  }

  protected emptyOutput(): AgentOutput {
    return {
      entities: [],
      relations: [],
      evidence: [],
      suggestions: [],
      metrics: {
        agentId: this.id,
        durationMs: 0,
        queriesExecuted: 0,
        cacheHits: 0,
        providersUsed: [],
        providersFailed: [],
        tokensUsed: 0,
        resultsFound: 0,
      },
    };
  }
}
