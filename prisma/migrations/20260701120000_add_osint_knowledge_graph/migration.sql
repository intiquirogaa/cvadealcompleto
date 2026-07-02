-- ============================================================
-- OSINT Intelligence Platform — Knowledge Graph Tables
-- ============================================================
-- 5 tables: osint_entities, osint_relations, osint_evidence,
--           osint_runs, osint_search_cache
-- ============================================================

-- CreateTable: osint_entities
CREATE TABLE "osint_entities" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "natural_key" TEXT NOT NULL,
    "properties_json" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence_factors_json" TEXT NOT NULL DEFAULT '{}',
    "evidence_json" TEXT NOT NULL DEFAULT '[]',
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated_by_run_id" TEXT NOT NULL,
    "superseded_by" TEXT,
    "crm_client_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "osint_entities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "osint_entities_type_natural_key_key" ON "osint_entities"("type", "natural_key");
CREATE INDEX "osint_entities_crm_client_id_idx" ON "osint_entities"("crm_client_id");
CREATE INDEX "osint_entities_type_idx" ON "osint_entities"("type");
CREATE INDEX "osint_entities_last_verified_at_idx" ON "osint_entities"("last_verified_at");

-- CreateTable: osint_relations
CREATE TABLE "osint_relations" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "properties_json" TEXT NOT NULL DEFAULT '{}',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence_factors_json" TEXT NOT NULL DEFAULT '{}',
    "evidence_json" TEXT NOT NULL DEFAULT '[]',
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated_by_run_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "osint_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "osint_relations_type_source_id_target_id_key" ON "osint_relations"("type", "source_id", "target_id");
CREATE INDEX "osint_relations_source_id_idx" ON "osint_relations"("source_id");
CREATE INDEX "osint_relations_target_id_idx" ON "osint_relations"("target_id");
CREATE INDEX "osint_relations_type_idx" ON "osint_relations"("type");

-- AddForeignKey
ALTER TABLE "osint_relations" ADD CONSTRAINT "osint_relations_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "osint_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "osint_relations" ADD CONSTRAINT "osint_relations_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "osint_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: osint_evidence
CREATE TABLE "osint_evidence" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "entity_id" TEXT,
    "source_domain" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "snippet" TEXT NOT NULL DEFAULT '',
    "raw_content" TEXT,
    "match_reasons_json" TEXT NOT NULL DEFAULT '[]',
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "osint_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "osint_evidence_run_id_idx" ON "osint_evidence"("run_id");
CREATE INDEX "osint_evidence_entity_id_idx" ON "osint_evidence"("entity_id");
CREATE INDEX "osint_evidence_source_domain_idx" ON "osint_evidence"("source_domain");

-- AddForeignKey
ALTER TABLE "osint_evidence" ADD CONSTRAINT "osint_evidence_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "osint_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: osint_runs
CREATE TABLE "osint_runs" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "triggered_by" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "cycles_executed" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "metrics_json" TEXT,
    "audit_trail_json" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "osint_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "osint_runs_client_id_started_at_idx" ON "osint_runs"("client_id", "started_at");
CREATE INDEX "osint_runs_status_idx" ON "osint_runs"("status");

-- CreateTable: osint_search_cache
CREATE TABLE "osint_search_cache" (
    "id" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "results_json" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "osint_search_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "osint_search_cache_cache_key_key" ON "osint_search_cache"("cache_key");
CREATE INDEX "osint_search_cache_expires_at_idx" ON "osint_search_cache"("expires_at");
CREATE INDEX "osint_search_cache_provider_idx" ON "osint_search_cache"("provider");
