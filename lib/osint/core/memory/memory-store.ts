// ============================================================
// OSINT Intelligence Platform — Memory Store
// ============================================================
// Entity-level memory with TTL, invalidation, and incremental
// reuse of prior investigations.
//
// Key capabilities:
//   1. Recall — check if an entity is "fresh" (within TTL) or "stale"
//   2. Invalidation — explicitly mark entities as needing refresh
//   3. Investigation planning — categorize entities into
//      skip (fresh) / refresh (stale) / missing (not found)
//   4. Reuse — load existing subgraph from DB and determine
//      what the planner needs to re-investigate
// ============================================================

import type {
  EntityType,
  GraphEntity,
  MemoryRecall,
  OsintConfig,
} from "../types";

import type { GraphStore } from "../persistence/graph-store";
import type { KnowledgeGraph } from "../persistence/knowledge-graph";
import { logger } from "../observability/logger";

// ─────────────────────────────────────────────────────────────
// Investigation Plan
// ─────────────────────────────────────────────────────────────

export interface InvestigationPlan {
  /** Entities that are fresh — the planner can skip re-investigating these */
  skip: GraphEntity[];
  /** Entities that are stale — the planner should refresh these */
  refresh: GraphEntity[];
  /** Entity types that have no entities at all — need fresh investigation */
  missing: EntityType[];
  /** Summary stats */
  stats: {
    totalRecalled: number;
    freshCount: number;
    staleCount: number;
    missingCount: number;
    estimatedQueriesSaved: number;
  };
}

// ─────────────────────────────────────────────────────────────
// MemoryStore
// ─────────────────────────────────────────────────────────────

export class MemoryStore {
  /** Set of entity IDs explicitly marked for refresh */
  private readonly invalidated = new Set<string>();

  /** Override "now" for testing */
  private nowOverride: Date | null = null;

  // ── Recall Operations ──

  /**
   * Check if a single entity is fresh or stale based on its TTL.
   * Pure function — no DB access.
   */
  recall(entity: GraphEntity, config: OsintConfig): MemoryRecall {
    const now = this.nowOverride ?? new Date();
    const verifiedAt = new Date(entity.lastVerifiedAt);
    const ageSeconds = Math.max(0, (now.getTime() - verifiedAt.getTime()) / 1000);

    const ttl = config.entityTtl[entity.type];
    const hasTtl = ttl !== undefined && ttl !== Infinity;

    const isFresh =
      !this.invalidated.has(entity.id) &&
      (!hasTtl || ageSeconds < ttl);

    return {
      entity,
      age: Math.round(ageSeconds),
      isFresh,
      requiresRefresh: !isFresh,
      relatedEntities: [],
    };
  }

  /**
   * Recall a batch of entities.
   */
  recallBatch(entities: GraphEntity[], config: OsintConfig): MemoryRecall[] {
    return entities.map((e) => this.recall(e, config));
  }

  /**
   * Recall all entities for a CRM client, loading from the GraphStore.
   * Includes related entities via the KnowledgeGraph.
   */
  async recallForClient(
    clientId: string,
    config: OsintConfig,
    store: GraphStore,
  ): Promise<MemoryRecall[]> {
    const entities = await store.getEntitiesByCrmClient(clientId);

    if (entities.length === 0) {
      logger.debug("Memory recall: no prior entities", { clientId });
      return [];
    }

    const recalls = this.recallBatch(entities, config);

    // Enrich with related entities from the graph
    const { relations } = await store.loadSubgraphForClient(clientId);
    const entityMap = new Map(entities.map((e) => [e.id, e]));
    const adjacency = new Map<string, Set<string>>();

    for (const rel of relations) {
      if (!adjacency.has(rel.sourceId)) adjacency.set(rel.sourceId, new Set());
      if (!adjacency.has(rel.targetId)) adjacency.set(rel.targetId, new Set());
      adjacency.get(rel.sourceId)!.add(rel.targetId);
      adjacency.get(rel.targetId)!.add(rel.sourceId);
    }

    for (const recall of recalls) {
      const neighborIds = adjacency.get(recall.entity.id);
      if (neighborIds) {
        recall.relatedEntities = Array.from(neighborIds)
          .map((id) => entityMap.get(id))
          .filter((e): e is GraphEntity => e !== undefined);
      }
    }

    const freshCount = recalls.filter((r) => r.isFresh).length;
    logger.debug("Memory recall complete", {
      clientId,
      totalEntities: recalls.length,
      fresh: freshCount,
      stale: recalls.length - freshCount,
    });

    return recalls;
  }

  /**
   * Recall with a pre-loaded KnowledgeGraph (avoids extra DB round-trip).
   */
  recallFromGraph(
    graph: KnowledgeGraph,
    config: OsintConfig,
  ): MemoryRecall[] {
    const entities = graph.getAllEntities();

    const recalls: MemoryRecall[] = [];

    for (const entity of entities) {
      const recall = this.recall(entity, config);
      // Use graph to find related entities
      const neighbors = graph.getNeighbors(entity.id);
      recall.relatedEntities = neighbors;
      recalls.push(recall);
    }

    return recalls;
  }

  // ── Invalidation ──

  /**
   * Explicitly mark an entity as needing refresh, regardless of TTL.
   */
  invalidate(entityId: string): void {
    this.invalidated.add(entityId);
    logger.debug("Entity invalidated", { entityId });
  }

  /**
   * Invalidate all entities of a given type.
   * Useful when a domain change is detected (e.g., company rebranded).
   */
  invalidateByType(entities: GraphEntity[], type: EntityType): number {
    let count = 0;
    for (const entity of entities) {
      if (entity.type === type) {
        this.invalidated.add(entity.id);
        count++;
      }
    }
    if (count > 0) {
      logger.debug("Invalidated entities by type", { type, count });
    }
    return count;
  }

  /**
   * Clear all invalidations.
   */
  clearInvalidations(): void {
    this.invalidated.clear();
  }

  // ── Investigation Planning ──

  /**
   * Build an investigation plan from memory recalls.
   *
   * Categorizes entities into:
   *   - skip: fresh, can be reused (saves queries)
   *   - refresh: stale or invalidated, need re-investigation
   *   - missing: entity types we expected but didn't find
   *
   * @param recalls - Memory recalls from recallForClient or recallFromGraph
   * @param expectedTypes - Entity types the investigation should cover
   */
  getInvestigationPlan(
    recalls: MemoryRecall[],
    expectedTypes: EntityType[],
  ): InvestigationPlan {
    const skip: GraphEntity[] = [];
    const refresh: GraphEntity[] = [];
    const foundTypes = new Set<EntityType>();

    for (const recall of recalls) {
      foundTypes.add(recall.entity.type);
      if (recall.isFresh) {
        skip.push(recall.entity);
      } else {
        refresh.push(recall.entity);
      }
    }

    const missing = expectedTypes.filter((t) => !foundTypes.has(t));

    // Estimate queries saved: each fresh entity ≈ 1-2 queries saved
    const estimatedQueriesSaved = skip.length * 2;

    const plan: InvestigationPlan = {
      skip,
      refresh,
      missing,
      stats: {
        totalRecalled: recalls.length,
        freshCount: skip.length,
        staleCount: refresh.length,
        missingCount: missing.length,
        estimatedQueriesSaved,
      },
    };

    logger.info("Investigation plan built", plan.stats);

    return plan;
  }

  /**
   * Convenience: recall for a client and build an investigation plan
   * in one call.
   */
  async planInvestigation(
    clientId: string,
    config: OsintConfig,
    store: GraphStore,
    expectedTypes: EntityType[],
  ): Promise<InvestigationPlan> {
    const recalls = await this.recallForClient(clientId, config, store);
    return this.getInvestigationPlan(recalls, expectedTypes);
  }

  // ── Filtering Helpers ──

  /**
   * Get only the fresh (reusable) entities from recalls.
   */
  static getFreshEntities(recalls: MemoryRecall[]): GraphEntity[] {
    return recalls.filter((r) => r.isFresh).map((r) => r.entity);
  }

  /**
   * Get only the stale (needs refresh) entities from recalls.
   */
  static getStaleEntities(recalls: MemoryRecall[]): GraphEntity[] {
    return recalls.filter((r) => r.requiresRefresh).map((r) => r.entity);
  }

  // ── Testing Helpers ──

  /**
   * Override "now" for testing purposes.
   */
  setNow(date: Date | null): void {
    this.nowOverride = date;
  }
}

/**
 * Singleton instance.
 */
export const memoryStore = new MemoryStore();
