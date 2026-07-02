// ============================================================
// OSINT Intelligence Platform — Knowledge Graph
// ============================================================
// In-memory graph representation that mirrors the database.
// Agents add entities/relations/evidence here during a run;
// the graph is then persisted to PostgreSQL via GraphStore.
//
// Key responsibilities:
//   1. Hold entities & relations in Maps for O(1) lookup
//   2. Provide neighbor traversal (BFS up to N hops)
//   3. Build PersonProfileView / CompanyProfileView
//   4. Compute overall confidence across the graph
//   5. Sync to/from GraphStore (load existing, persist new)
// ============================================================

import type {
  EntityType,
  GraphEntity,
  GraphRelation,
  EvidenceRecord,
  ConfidenceFactors,
  PersonProfileView,
  CompanyProfileView,
  RelationType,
} from "../types";

import {
  computeNaturalKey,
  mergeEntity,
  mergeRelation,
  mergeEvidenceRefs,
} from "./entity-resolver";

import type { GraphStore } from "./graph-store";

// ─────────────────────────────────────────────────────────────
// SerializedGraph (for JSON export/import)
// ─────────────────────────────────────────────────────────────

export interface SerializedGraph {
  entities: GraphEntity[];
  relations: GraphRelation[];
  evidence: EvidenceRecord[];
}

// ─────────────────────────────────────────────────────────────
// KnowledgeGraph
// ─────────────────────────────────────────────────────────────

export class KnowledgeGraph {
  /** Entity ID → GraphEntity */
  private readonly entities = new Map<string, GraphEntity>();

  /** Relation ID → GraphRelation */
  private readonly relations = new Map<string, GraphRelation>();

  /** Evidence ID → EvidenceRecord */
  private readonly evidence = new Map<string, EvidenceRecord>();

  /** Adjacency: sourceId → Set<relationId> */
  private readonly outEdges = new Map<string, Set<string>>();

  /** Adjacency: targetId → Set<relationId> */
  private readonly inEdges = new Map<string, Set<string>>();

  /** Reverse lookup: naturalKey → entityId (for dedup within the graph) */
  private readonly naturalKeyIndex = new Map<string, string>();

  // ── Add Operations ──

  /**
   * Add an entity to the graph.  If an entity with the same natural
   * key already exists, it is merged (properties combined, confidence
   * maxed, evidence unioned).  Returns the canonical entity.
   */
  addEntity(entity: GraphEntity): GraphEntity {
    const nk = computeNaturalKey(entity.type, entity.properties);
    const existingId = this.naturalKeyIndex.get(nk);

    if (existingId) {
      const existing = this.entities.get(existingId)!;
      const merged = mergeEntity(existing, entity);
      // Preserve the existing ID
      merged.id = existingId;
      this.entities.set(existingId, merged);
      return merged;
    }

    // New entity
    this.entities.set(entity.id, entity);
    this.naturalKeyIndex.set(nk, entity.id);
    return entity;
  }

  /**
   * Add a relation to the graph.  If a relation with the same
   * (type, sourceId, targetId) already exists, it is merged.
   */
  addRelation(rel: GraphRelation): GraphRelation {
    const key = `${rel.type}:${rel.sourceId}:${rel.targetId}`;

    // Check for existing relation with same triple
    for (const [relId, existing] of this.relations) {
      if (
        existing.type === rel.type &&
        existing.sourceId === rel.sourceId &&
        existing.targetId === rel.targetId
      ) {
        const merged = mergeRelation(existing, rel);
        merged.id = relId;
        this.relations.set(relId, merged);
        return merged;
      }
    }

    // New relation
    this.relations.set(rel.id, rel);

    // Update adjacency
    if (!this.outEdges.has(rel.sourceId)) {
      this.outEdges.set(rel.sourceId, new Set());
    }
    this.outEdges.get(rel.sourceId)!.add(rel.id);

    if (!this.inEdges.has(rel.targetId)) {
      this.inEdges.set(rel.targetId, new Set());
    }
    this.inEdges.get(rel.targetId)!.add(rel.id);

    return rel;
  }

  /**
   * Add an evidence record to the graph.
   */
  addEvidence(ev: EvidenceRecord): void {
    if (!this.evidence.has(ev.id)) {
      this.evidence.set(ev.id, ev);
    }
  }

  // ── Get Operations ──

  getEntity(id: string): GraphEntity | undefined {
    return this.entities.get(id);
  }

  getEntitiesByType(type: EntityType): GraphEntity[] {
    const result: GraphEntity[] = [];
    for (const entity of this.entities.values()) {
      if (entity.type === type) result.push(entity);
    }
    return result;
  }

  /**
   * Find a person entity by normalized full name.
   */
  findPerson(normalizedName: string): GraphEntity | undefined {
    const nk = `person:${normalizedName.toLowerCase().trim().replace(/\s+/g, " ")}`;
    const id = this.naturalKeyIndex.get(nk);
    return id ? this.entities.get(id) : undefined;
  }

  /**
   * Find a company entity by normalized name.
   */
  findCompany(normalizedName: string): GraphEntity | undefined {
    const nk = `company:${normalizedName.toLowerCase().trim().replace(/\s+/g, " ")}`;
    const id = this.naturalKeyIndex.get(nk);
    return id ? this.entities.get(id) : undefined;
  }

  getRelation(id: string): GraphRelation | undefined {
    return this.relations.get(id);
  }

  getRelations(): GraphRelation[] {
    return Array.from(this.relations.values());
  }

  getEvidence(): EvidenceRecord[] {
    return Array.from(this.evidence.values());
  }

  /**
   * Get all relations involving an entity (as source or target).
   */
  getRelationsForEntity(entityId: string): GraphRelation[] {
    const outSet = this.outEdges.get(entityId) ?? new Set<string>();
    const inSet = this.inEdges.get(entityId) ?? new Set<string>();
    const relIds = new Set([...outSet, ...inSet]);
    const result: GraphRelation[] = [];
    for (const id of relIds) {
      const rel = this.relations.get(id);
      if (rel) result.push(rel);
    }
    return result;
  }

  /**
   * Get relations of a specific type involving an entity.
   */
  getRelationsByType(entityId: string, type: RelationType): GraphRelation[] {
    return this.getRelationsForEntity(entityId).filter((r) => r.type === type);
  }

  /**
   * Get all entities directly connected to the given entity.
   * Optionally filter by relation type and direction.
   */
  getNeighbors(
    entityId: string,
    options?: {
      direction?: "out" | "in" | "both";
      relationType?: RelationType;
      targetType?: EntityType;
    },
  ): GraphEntity[] {
    const direction = options?.direction ?? "both";
    const neighborIds = new Set<string>();

    if (direction === "out" || direction === "both") {
      const outRels = this.outEdges.get(entityId) ?? new Set<string>();
      for (const relId of outRels) {
        const rel = this.relations.get(relId);
        if (!rel) continue;
        if (options?.relationType && rel.type !== options.relationType) continue;
        neighborIds.add(rel.targetId);
      }
    }

    if (direction === "in" || direction === "both") {
      const inRels = this.inEdges.get(entityId) ?? new Set<string>();
      for (const relId of inRels) {
        const rel = this.relations.get(relId);
        if (!rel) continue;
        if (options?.relationType && rel.type !== options.relationType) continue;
        neighborIds.add(rel.sourceId);
      }
    }

    const result: GraphEntity[] = [];
    for (const id of neighborIds) {
      const entity = this.entities.get(id);
      if (!entity) continue;
      if (options?.targetType && entity.type !== options.targetType) continue;
      result.push(entity);
    }
    return result;
  }

  /**
   * BFS traversal up to `maxHops` levels from the given entity.
   */
  getReachableEntities(
    startId: string,
    maxHops: number,
  ): GraphEntity[] {
    const visited = new Set<string>([startId]);
    const frontier = [startId];
    const result: GraphEntity[] = [];

    for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        const neighbors = this.getNeighbors(id);
        for (const n of neighbors) {
          if (!visited.has(n.id)) {
            visited.add(n.id);
            next.push(n.id);
            result.push(n);
          }
        }
      }
      frontier.length = 0;
      frontier.push(...next);
    }

    return result;
  }

  // ── Aggregate Stats ──

  /**
   * Get all entities as an array.
   */
  getAllEntities(): GraphEntity[] {
    return Array.from(this.entities.values());
  }

  get entityCount(): number {
    return this.entities.size;
  }

  get relationCount(): number {
    return this.relations.size;
  }

  get evidenceCount(): number {
    return this.evidence.size;
  }

  /**
   * Compute the overall average confidence across all entities.
   */
  computeOverallConfidence(): number {
    if (this.entities.size === 0) return 0;
    let sum = 0;
    for (const entity of this.entities.values()) {
      sum += entity.confidence;
    }
    return sum / this.entities.size;
  }

  /**
   * Get the set of provider IDs that contributed evidence.
   */
  getEvidenceProviders(): Set<string> {
    const providers = new Set<string>();
    for (const ev of this.evidence.values()) {
      providers.add(ev.provider);
    }
    return providers;
  }

  // ── Profile View Builders ──

  /**
   * Build a PersonProfileView centered on the given person entity.
   * Traverses the graph to find related phone, email, social profiles,
   * position, company, address, and news items.
   */
  buildPersonProfileView(personId: string): PersonProfileView | null {
    const person = this.entities.get(personId);
    if (!person || person.type !== "person") return null;

    const socialProfiles = this.getNeighbors(personId, {
      direction: "out",
      relationType: "HAS_SOCIAL",
      targetType: "social_profile",
    });

    const phones = this.getNeighbors(personId, {
      direction: "out",
      relationType: "HAS_PHONE",
      targetType: "phone",
    });

    const emails = this.getNeighbors(personId, {
      direction: "out",
      relationType: "HAS_EMAIL",
      targetType: "email",
    });

    const positions = this.getNeighbors(personId, {
      direction: "out",
      relationType: "HAS_POSITION",
      targetType: "position",
    });

    // Company is found via WORKS_AT relation from person
    const companyEntities = this.getNeighbors(personId, {
      direction: "out",
      relationType: "WORKS_AT",
      targetType: "company",
    });

    const addresses = this.getNeighbors(personId, {
      direction: "out",
      relationType: "LOCATED_AT",
      targetType: "address",
    });

    const newsItems = this.getNeighbors(personId, {
      direction: "in",
      relationType: "MENTIONED_IN",
      targetType: "news_item",
    });

    return {
      person,
      socialProfiles,
      phone: phones[0] ?? null,
      email: emails[0] ?? null,
      position: positions[0] ?? null,
      company: companyEntities[0] ?? null,
      address: addresses[0] ?? null,
      newsItems,
    };
  }

  /**
   * Build a CompanyProfileView centered on the given company entity.
   */
  buildCompanyProfileView(companyId: string): CompanyProfileView | null {
    const company = this.entities.get(companyId);
    if (!company || company.type !== "company") return null;

    const domains = this.getNeighbors(companyId, {
      direction: "out",
      relationType: "OWNS_DOMAIN",
      targetType: "domain",
    });

    const websites = this.getNeighbors(companyId, {
      direction: "out",
      relationType: "HAS_WEBSITE",
      targetType: "website",
    });

    const socialProfiles = this.getNeighbors(companyId, {
      direction: "out",
      relationType: "HAS_SOCIAL",
      targetType: "social_profile",
    });

    const addresses = this.getNeighbors(companyId, {
      direction: "out",
      relationType: "LOCATED_AT",
      targetType: "address",
    });

    const newsItems = this.getNeighbors(companyId, {
      direction: "in",
      relationType: "MENTIONED_IN",
      targetType: "news_item",
    });

    const competitors = this.getNeighbors(companyId, {
      direction: "both",
      relationType: "COMPETITOR_OF",
      targetType: "company",
    });

    return {
      company,
      domain: domains[0] ?? null,
      website: websites[0] ?? null,
      socialProfiles,
      address: addresses[0] ?? null,
      newsItems,
      competitors,
    };
  }

  // ── Serialization ──

  toJSON(): SerializedGraph {
    return {
      entities: Array.from(this.entities.values()),
      relations: Array.from(this.relations.values()),
      evidence: Array.from(this.evidence.values()),
    };
  }

  static fromJSON(data: SerializedGraph): KnowledgeGraph {
    const graph = new KnowledgeGraph();
    for (const entity of data.entities) graph.addEntity(entity);
    for (const rel of data.relations) graph.addRelation(rel);
    for (const ev of data.evidence) graph.addEvidence(ev);
    return graph;
  }

  // ── Persistence Sync ──

  /**
   * Load all entities, relations, and evidence for a CRM client
   * from the database into this in-memory graph.
   */
  async loadFromStore(store: GraphStore, clientId: string): Promise<void> {
    const { entities, relations, evidence } = await store.loadSubgraphForClient(clientId);

    for (const entity of entities) {
      // Don't merge — these are the canonical DB records
      this.entities.set(entity.id, entity);
      const nk = computeNaturalKey(entity.type, entity.properties);
      this.naturalKeyIndex.set(nk, entity.id);
    }

    for (const rel of relations) {
      this.relations.set(rel.id, rel);
      if (!this.outEdges.has(rel.sourceId)) this.outEdges.set(rel.sourceId, new Set());
      this.outEdges.get(rel.sourceId)!.add(rel.id);
      if (!this.inEdges.has(rel.targetId)) this.inEdges.set(rel.targetId, new Set());
      this.inEdges.get(rel.targetId)!.add(rel.id);
    }

    for (const ev of evidence) {
      this.evidence.set(ev.id, ev);
    }
  }

  /**
   * Persist all entities and relations in this graph to the database.
   * Uses upsert so existing records are updated, new ones are inserted.
   */
  async persistToStore(store: GraphStore): Promise<void> {
    await store.upsertEntitiesBatch(Array.from(this.entities.values()));
    await store.upsertRelationsBatch(Array.from(this.relations.values()));

    // Insert evidence (skip already-persisted ones)
    const newEvidence = Array.from(this.evidence.values());
    if (newEvidence.length > 0) {
      await store.insertEvidenceBatch(newEvidence);
    }
  }

  /**
   * Get a summary string for logging/debugging.
   */
  summarize(): string {
    const byType = new Map<string, number>();
    for (const e of this.entities.values()) {
      byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    }
    const parts = Array.from(byType.entries()).map(([t, c]) => `${t}:${c}`);
    return `${this.entities.size} entities [${parts.join(", ")}], ${this.relations.size} relations, ${this.evidence.size} evidence`;
  }
}
