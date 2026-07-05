// ============================================================
// OSINT Intelligence Platform — Graph Store
// ============================================================
// Prisma-backed persistence layer for the Knowledge Graph.
// Handles serialization between TypeScript domain objects
// (GraphEntity, GraphRelation, EvidenceRecord) and Prisma rows.
//
// Uses upsert with unique constraints for idempotent writes:
//   - Entities:  @@unique([type, naturalKey])
//   - Relations: @@unique([type, sourceId, targetId])
// ============================================================

import { prisma } from "@/lib/db";

import type {
  EntityType,
  EntityProperties,
  GraphEntity,
  GraphRelation,
  EvidenceRecord,
  EvidenceRef,
  ConfidenceFactors,
  ProviderResult,
  RunMetrics,
  PlannerDecision,
} from "../types";

import { computeNaturalKey } from "./entity-resolver";
import { logger } from "../observability/logger";

// ─────────────────────────────────────────────────────────────
// Local Row Types (mirror Prisma schema until full client regen)
// ─────────────────────────────────────────────────────────────

interface EntityRow {
  id: string;
  type: string;
  naturalKey: string;
  propertiesJson: string;
  confidence: number;
  confidenceFactorsJson: string;
  evidenceJson: string;
  firstSeenAt: Date;
  lastVerifiedAt: Date;
  lastUpdatedByRunId: string;
  supersededBy: string | null;
  crmClientId: string | null;
}

interface RelationRow {
  id: string;
  type: string;
  sourceId: string;
  targetId: string;
  propertiesJson: string;
  confidence: number;
  confidenceFactorsJson: string;
  evidenceJson: string;
  firstSeenAt: Date;
  lastVerifiedAt: Date;
  lastUpdatedByRunId: string;
}

interface EvidenceRow {
  id: string;
  runId: string;
  entityId: string | null;
  sourceDomain: string;
  sourceUrl: string;
  sourceType: string;
  provider: string;
  title: string;
  snippet: string;
  rawContent: string | null;
  matchReasonsJson: string;
  extractedAt: Date;
}

interface RunRow {
  id: string;
  clientId: string;
  trigger: string;
  triggeredBy: string;
  status: string;
  cyclesExecuted: number;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number;
  metricsJson: string | null;
  auditTrailJson: string | null;
  error: string | null;
}

/** Typed accessor for the new OSINT Prisma models. */
const db = prisma as unknown as {
  osintEntity: {
    upsert(args: Record<string, unknown>): Promise<EntityRow>;
    findUnique(args: Record<string, unknown>): Promise<EntityRow | null>;
    findMany(args: Record<string, unknown>): Promise<EntityRow[]>;
    update(args: Record<string, unknown>): Promise<EntityRow>;
  };
  osintRelation: {
    upsert(args: Record<string, unknown>): Promise<RelationRow>;
    findMany(args: Record<string, unknown>): Promise<RelationRow[]>;
  };
  osintEvidence: {
    create(args: Record<string, unknown>): Promise<EvidenceRow>;
    createMany(args: Record<string, unknown>): Promise<{ count: number }>;
    findMany(args: Record<string, unknown>): Promise<EvidenceRow[]>;
    delete(args: Record<string, unknown>): Promise<unknown>;
  };
  osintRun: {
    create(args: Record<string, unknown>): Promise<RunRow>;
    update(args: Record<string, unknown>): Promise<RunRow>;
    upsert(args: Record<string, unknown>): Promise<RunRow>;
    findUnique(args: Record<string, unknown>): Promise<RunRow | null>;
    findFirst(args: Record<string, unknown>): Promise<RunRow | null>;
    findMany(args: Record<string, unknown>): Promise<RunRow[]>;
  };
  osintSearchCache: {
    upsert(args: Record<string, unknown>): Promise<unknown>;
    findUnique(args: Record<string, unknown>): Promise<{ cacheKey: string; expiresAt: Date; resultsJson: string; id: string } | null>;
    delete(args: Record<string, unknown>): Promise<unknown>;
    deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
};

// ─────────────────────────────────────────────────────────────
// Serialization Helpers
// ─────────────────────────────────────────────────────────────

function entityToCreateData(
  entity: GraphEntity,
  naturalKey: string,
): Record<string, unknown> {
  return {
    id: entity.id,
    type: entity.type,
    naturalKey,
    propertiesJson: JSON.stringify(entity.properties),
    confidence: entity.confidence,
    confidenceFactorsJson: JSON.stringify(entity.confidenceFactors),
    evidenceJson: JSON.stringify(entity.evidence),
    firstSeenAt: new Date(entity.firstSeenAt),
    lastVerifiedAt: new Date(entity.lastVerifiedAt),
    lastUpdatedByRunId: entity.lastUpdatedByRunId,
    supersededBy: entity.supersededBy ?? null,
    crmClientId: entity.crmClientId ?? null,
  };
}

function rowToEntity(row: EntityRow): GraphEntity {
  return {
    id: row.id,
    type: row.type as EntityType,
    properties: JSON.parse(row.propertiesJson) as EntityProperties,
    confidence: row.confidence,
    confidenceFactors: JSON.parse(row.confidenceFactorsJson) as ConfidenceFactors,
    evidence: JSON.parse(row.evidenceJson) as EvidenceRef[],
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastVerifiedAt: row.lastVerifiedAt.toISOString(),
    lastUpdatedByRunId: row.lastUpdatedByRunId,
    supersededBy: row.supersededBy ?? undefined,
    crmClientId: row.crmClientId ?? undefined,
  };
}

function relationToCreateData(
  rel: GraphRelation,
): Record<string, unknown> {
  return {
    id: rel.id,
    type: rel.type,
    sourceId: rel.sourceId,
    targetId: rel.targetId,
    propertiesJson: JSON.stringify(rel.properties ?? {}),
    confidence: rel.confidence,
    confidenceFactorsJson: JSON.stringify(rel.confidenceFactors),
    evidenceJson: JSON.stringify(rel.evidence),
    firstSeenAt: new Date(rel.firstSeenAt),
    lastVerifiedAt: new Date(rel.lastVerifiedAt),
    lastUpdatedByRunId: rel.lastUpdatedByRunId,
  };
}

function rowToRelation(row: RelationRow): GraphRelation {
  return {
    id: row.id,
    type: row.type as GraphRelation["type"],
    sourceId: row.sourceId,
    targetId: row.targetId,
    properties: JSON.parse(row.propertiesJson),
    confidence: row.confidence,
    confidenceFactors: JSON.parse(row.confidenceFactorsJson) as ConfidenceFactors,
    evidence: JSON.parse(row.evidenceJson) as EvidenceRef[],
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastVerifiedAt: row.lastVerifiedAt.toISOString(),
    lastUpdatedByRunId: row.lastUpdatedByRunId,
  };
}

function evidenceToCreateData(
  ev: EvidenceRecord,
): Record<string, unknown> {
  return {
    id: ev.id,
    runId: ev.runId,
    entityId: ev.entityId ?? null,
    sourceDomain: ev.sourceDomain,
    sourceUrl: ev.sourceUrl,
    sourceType: ev.sourceType,
    provider: ev.provider,
    title: ev.title,
    snippet: ev.snippet,
    rawContent: ev.rawContent ?? null,
    matchReasonsJson: JSON.stringify(ev.matchReasons),
    extractedAt: new Date(ev.extractedAt),
  };
}

function rowToEvidence(row: EvidenceRow): EvidenceRecord {
  return {
    id: row.id,
    runId: row.runId,
    entityId: row.entityId ?? undefined,
    sourceDomain: row.sourceDomain,
    sourceUrl: row.sourceUrl,
    sourceType: row.sourceType as EvidenceRecord["sourceType"],
    provider: row.provider,
    title: row.title,
    snippet: row.snippet,
    rawContent: row.rawContent ?? undefined,
    matchReasons: JSON.parse(row.matchReasonsJson) as string[],
    extractedAt: row.extractedAt.toISOString(),
  };
}

function rowToRun(row: RunRow): RunRecord {
  return {
    id: row.id,
    clientId: row.clientId,
    trigger: row.trigger as "manual" | "scheduled" | "webhook",
    triggeredBy: row.triggeredBy,
    status: row.status as RunRecord["status"],
    cyclesExecuted: row.cyclesExecuted,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
    metrics: row.metricsJson ? (JSON.parse(row.metricsJson) as RunMetrics) : null,
    auditTrail: row.auditTrailJson ? (JSON.parse(row.auditTrailJson) as PlannerDecision[]) : null,
    error: row.error ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface RunRecord {
  id: string;
  clientId: string;
  trigger: "manual" | "scheduled" | "webhook";
  triggeredBy: string;
  status: "pending" | "running" | "completed" | "partial" | "failed" | "timeout";
  cyclesExecuted: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  metrics: RunMetrics | null;
  auditTrail: PlannerDecision[] | null;
  error: string | null;
}

export interface CreateRunInput {
  id?: string;
  clientId: string;
  trigger: "manual" | "scheduled" | "webhook";
  triggeredBy: string;
}

export interface CompleteRunInput {
  status: "completed" | "partial" | "failed" | "timeout";
  cyclesExecuted: number;
  durationMs: number;
  metrics?: RunMetrics;
  auditTrail?: PlannerDecision[];
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// GraphStore
// ─────────────────────────────────────────────────────────────

/**
 * Prisma-backed persistence for the Knowledge Graph.
 * All methods are async and return domain objects (not Prisma rows).
 */
export class GraphStore {
  // ── Entity Operations ──

  /**
   * Upsert an entity by its natural key.
   * If an entity with the same (type, naturalKey) exists, its
   * properties/confidence/evidence are updated. Otherwise a new
   * row is inserted.
   */
  async upsertEntity(entity: GraphEntity): Promise<GraphEntity> {
    const naturalKey = computeNaturalKey(entity.type, entity.properties, entity.crmClientId);
    const data = entityToCreateData(entity, naturalKey);

    const row = await db.osintEntity.upsert({
      where: {
        type_naturalKey: {
          type: entity.type,
          naturalKey,
        },
      },
      create: data as never,
      update: {
        propertiesJson: data.propertiesJson as string,
        confidence: data.confidence as number,
        confidenceFactorsJson: data.confidenceFactorsJson as string,
        evidenceJson: data.evidenceJson as string,
        lastVerifiedAt: data.lastVerifiedAt as Date,
        lastUpdatedByRunId: data.lastUpdatedByRunId as string,
        supersededBy: (data.supersededBy as string) ?? null,
        crmClientId: (data.crmClientId as string) ?? null,
      } as never,
    });

    return rowToEntity(row);
  }

  /**
   * Get a single entity by its primary key.
   */
  async getEntity(id: string): Promise<GraphEntity | null> {
    const row = await db.osintEntity.findUnique({ where: { id } });
    return row ? rowToEntity(row) : null;
  }

  /**
   * Get a single entity by its natural key.
   */
  async getEntityByNaturalKey(
    type: EntityType,
    naturalKey: string,
  ): Promise<GraphEntity | null> {
    const row = await db.osintEntity.findUnique({
      where: {
        type_naturalKey: { type, naturalKey },
      },
    });
    return row ? rowToEntity(row) : null;
  }

  /**
   * Get all entities linked to a CRM client.
   */
  async getEntitiesByCrmClient(clientId: string): Promise<GraphEntity[]> {
    const rows = await db.osintEntity.findMany({
      where: { crmClientId: clientId },
      orderBy: { lastVerifiedAt: "desc" },
    });
    return rows.map(rowToEntity);
  }

  /**
   * Get all entities of a specific type.
   */
  async getEntitiesByType(type: EntityType): Promise<GraphEntity[]> {
    const rows = await db.osintEntity.findMany({
      where: { type },
      orderBy: { lastVerifiedAt: "desc" },
    });
    return rows.map(rowToEntity);
  }

  /**
   * Get entities that haven't been verified since the given date.
   * Used by the Memory system to find stale entities.
   */
  async getStaleEntities(olderThan: Date): Promise<GraphEntity[]> {
    const rows = await db.osintEntity.findMany({
      where: { lastVerifiedAt: { lt: olderThan } },
    });
    return rows.map(rowToEntity);
  }

  /**
   * Mark an entity as superseded by another.
   */
  async supersedeEntity(entityId: string, supersededById: string): Promise<void> {
    await db.osintEntity.update({
      where: { id: entityId },
      data: { supersededBy: supersededById },
    });
  }

  // ── Relation Operations ──

  /**
   * Upsert a relation by its unique (type, sourceId, targetId) key.
   */
  async upsertRelation(rel: GraphRelation): Promise<GraphRelation> {
    const data = relationToCreateData(rel);

    const row = await db.osintRelation.upsert({
      where: {
        type_sourceId_targetId: {
          type: rel.type,
          sourceId: rel.sourceId,
          targetId: rel.targetId,
        },
      },
      create: data as never,
      update: {
        propertiesJson: data.propertiesJson as string,
        confidence: data.confidence as number,
        confidenceFactorsJson: data.confidenceFactorsJson as string,
        evidenceJson: data.evidenceJson as string,
        lastVerifiedAt: data.lastVerifiedAt as Date,
        lastUpdatedByRunId: data.lastUpdatedByRunId as string,
      } as never,
    });

    return rowToRelation(row);
  }

  /**
   * Get all relations where the entity is either the source or target.
   */
  async getRelationsForEntity(entityId: string): Promise<GraphRelation[]> {
    const rows = await db.osintRelation.findMany({
      where: {
        OR: [{ sourceId: entityId }, { targetId: entityId }],
      },
    });
    return rows.map(rowToRelation);
  }

  /**
   * Get all relations of a specific type.
   */
  async getRelationsByType(type: GraphRelation["type"]): Promise<GraphRelation[]> {
    const rows = await db.osintRelation.findMany({
      where: { type },
    });
    return rows.map(rowToRelation);
  }

  // ── Evidence Operations ──

  /**
   * Insert a new evidence record.
   */
  async insertEvidence(ev: EvidenceRecord): Promise<EvidenceRecord> {
    const data = evidenceToCreateData(ev);
    const row = await db.osintEvidence.create({ data: data as never });
    return rowToEvidence(row);
  }

  /**
   * Batch-insert multiple evidence records.
   */
  async insertEvidenceBatch(records: EvidenceRecord[]): Promise<number> {
    if (records.length === 0) return 0;
    const data = records.map((ev) => evidenceToCreateData(ev));
    try {
      const result = await db.osintEvidence.createMany({
        data: data as never,
        skipDuplicates: true,
      });
      return result.count;
    } catch (err) {
      // createMany is all-or-nothing: one bad row (e.g. a dangling
      // entityId) would otherwise silently drop every evidence record for
      // the run. Fall back to inserting one at a time so a single bad
      // reference doesn't take the rest down with it.
      logger.warn("Evidence batch insert failed, retrying individually", {
        count: records.length,
        error: err instanceof Error ? err.message : String(err),
      });
      let inserted = 0;
      for (const ev of data) {
        try {
          await db.osintEvidence.create({ data: ev as never });
          inserted++;
        } catch (rowErr) {
          logger.warn("Failed to insert evidence record", {
            evidenceId: (ev as { id?: string }).id,
            error: rowErr instanceof Error ? rowErr.message : String(rowErr),
          });
        }
      }
      return inserted;
    }
  }

  /**
   * Get all evidence records for a given entity.
   */
  async getEvidenceForEntity(entityId: string): Promise<EvidenceRecord[]> {
    const rows = await db.osintEvidence.findMany({
      where: { entityId },
      orderBy: { extractedAt: "desc" },
    });
    return rows.map(rowToEvidence);
  }

  /**
   * Get all evidence records for a given run.
   */
  async getEvidenceForRun(runId: string): Promise<EvidenceRecord[]> {
    const rows = await db.osintEvidence.findMany({
      where: { runId },
      orderBy: { extractedAt: "desc" },
    });
    return rows.map(rowToEvidence);
  }

  // ── Run Operations ──

  /**
   * Create a new investigation run.
   */
  async createRun(input: CreateRunInput): Promise<RunRecord> {
    if (input.id) {
      // A caller (API route, worker) may have already created a placeholder
      // row with this id for SSE subscription purposes — reuse it instead
      // of creating a second, disconnected run.
      const row = await db.osintRun.upsert({
        where: { id: input.id },
        create: {
          id: input.id,
          clientId: input.clientId,
          trigger: input.trigger,
          triggeredBy: input.triggeredBy,
          status: "running",
        },
        update: {
          status: "running",
        },
      });
      return rowToRun(row);
    }

    const row = await db.osintRun.create({
      data: {
        clientId: input.clientId,
        trigger: input.trigger,
        triggeredBy: input.triggeredBy,
        status: "running",
      },
    });
    return rowToRun(row);
  }

  /**
   * Update a run's cycle count (called after each planner cycle).
   */
  async updateRunCycles(runId: string, cycles: number): Promise<void> {
    await db.osintRun.update({
      where: { id: runId },
      data: { cyclesExecuted: cycles },
    });
  }

  /**
   * Complete a run with final status, metrics, and audit trail.
   */
  async completeRun(runId: string, input: CompleteRunInput): Promise<RunRecord> {
    const row = await db.osintRun.update({
      where: { id: runId },
      data: {
        status: input.status,
        cyclesExecuted: input.cyclesExecuted,
        completedAt: new Date(),
        durationMs: input.durationMs,
        metricsJson: input.metrics ? JSON.stringify(input.metrics) : null,
        auditTrailJson: input.auditTrail ? JSON.stringify(input.auditTrail) : null,
        error: input.error ?? null,
      },
    });
    return rowToRun(row);
  }

  /**
   * Get a run by ID.
   */
  async getRun(runId: string): Promise<RunRecord | null> {
    const row = await db.osintRun.findUnique({ where: { id: runId } });
    return row ? rowToRun(row) : null;
  }

  /**
   * Get the most recent run for a CRM client.
   */
  async getLatestRunForClient(clientId: string): Promise<RunRecord | null> {
    const row = await db.osintRun.findFirst({
      where: { clientId },
      orderBy: { startedAt: "desc" },
    });
    return row ? rowToRun(row) : null;
  }

  /**
   * Get all runs for a CRM client, most recent first.
   */
  async getRunsForClient(clientId: string, limit?: number): Promise<RunRecord[]> {
    const rows = await db.osintRun.findMany({
      where: { clientId },
      orderBy: { startedAt: "desc" },
      take: limit,
    });
    return rows.map(rowToRun);
  }

  // ── Search Cache Operations ──

  /**
   * Compute a cache key from provider + query + options.
   */
  static computeCacheKey(
    provider: string,
    query: string,
    options?: Record<string, unknown>,
  ): string {
    const optsStr = options ? JSON.stringify(options) : "";
    return `${provider}:${query}:${optsStr}`;
  }

  /**
   * Get cached search results if they exist and haven't expired.
   */
  async getCachedSearch(cacheKey: string): Promise<ProviderResult[] | null> {
    const row = await db.osintSearchCache.findUnique({
      where: { cacheKey },
    });

    if (!row) return null;

    if (new Date(row.expiresAt) < new Date()) {
      // Expired — delete and return null
      await db.osintSearchCache.delete({ where: { id: row.id } }).catch(() => {});
      return null;
    }

    return JSON.parse(row.resultsJson) as ProviderResult[];
  }

  /**
   * Store search results in the cache.
   */
  async setCachedSearch(
    provider: string,
    query: string,
    results: ProviderResult[],
    ttlDays: number,
    options?: Record<string, unknown>,
  ): Promise<void> {
    const cacheKey = GraphStore.computeCacheKey(provider, query, options);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await db.osintSearchCache.upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        provider,
        query,
        resultsJson: JSON.stringify(results),
        expiresAt,
      },
      update: {
        resultsJson: JSON.stringify(results),
        expiresAt,
        createdAt: new Date(),
      },
    });
  }

  /**
   * Delete all expired cache entries. Returns the count deleted.
   */
  async cleanExpiredCache(): Promise<number> {
    const result = await db.osintSearchCache.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }

  // ── Bulk Operations ──

  /**
   * Persist a batch of entities. Existing entities are updated,
   * new ones are inserted.  Uses sequential upsert to avoid
   * race conditions with Prisma's unique constraint handling.
   *
   * Returns a map from each input entity's *original* (in-memory) id to
   * the id it actually has in the database. These differ whenever the
   * entity's natural key already existed from an earlier run — Prisma's
   * upsert() keeps the pre-existing row's id on update, it doesn't adopt
   * the new one. Callers must remap relation/evidence foreign keys through
   * this map before persisting them, or they'll point at an id that was
   * never actually written (FK violation).
   */
  async upsertEntitiesBatch(entities: GraphEntity[]): Promise<Map<string, string>> {
    const idMap = new Map<string, string>();
    for (const entity of entities) {
      try {
        const saved = await this.upsertEntity(entity);
        idMap.set(entity.id, saved.id);
      } catch (err) {
        logger.warn("Failed to upsert entity", {
          entityId: entity.id,
          entityType: entity.type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return idMap;
  }

  /**
   * Persist a batch of relations.
   */
  async upsertRelationsBatch(relations: GraphRelation[]): Promise<GraphRelation[]> {
    const results: GraphRelation[] = [];
    for (const rel of relations) {
      try {
        const saved = await this.upsertRelation(rel);
        results.push(saved);
      } catch (err) {
        logger.warn("Failed to upsert relation", {
          relationId: rel.id,
          relationType: rel.type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  /**
   * Load the full subgraph for a CRM client — all entities,
   * their relations, and evidence — in a single batch.
   */
  async loadSubgraphForClient(clientId: string): Promise<{
    entities: GraphEntity[];
    relations: GraphRelation[];
    evidence: EvidenceRecord[];
  }> {
    const entities = await this.getEntitiesByCrmClient(clientId);
    const entityIds = entities.map((e) => e.id);

    if (entityIds.length === 0) {
      return { entities: [], relations: [], evidence: [] };
    }

    const [relationRows, evidenceRows] = await Promise.all([
      db.osintRelation.findMany({
        where: {
          OR: [
            { sourceId: { in: entityIds } },
            { targetId: { in: entityIds } },
          ],
        },
      }),
      db.osintEvidence.findMany({
        where: { entityId: { in: entityIds } },
        orderBy: { extractedAt: "desc" },
      }),
    ]);

    return {
      entities,
      relations: relationRows.map(rowToRelation),
      evidence: evidenceRows.map(rowToEvidence),
    };
  }
}

/**
 * Singleton instance — import this everywhere.
 */
export const graphStore = new GraphStore();
