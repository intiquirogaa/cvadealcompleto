-- CreateTable
CREATE TABLE "crm_activity_logs" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'system',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "metadata" TEXT DEFAULT '',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_activity_logs_client_id_created_at_idx" ON "crm_activity_logs"("client_id", "created_at");

-- AddForeignKey
ALTER TABLE "crm_activity_logs" ADD CONSTRAINT "crm_activity_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "crm_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataCleanup
-- Remove automatic OSINT pipeline lines from advisor notes. Human-written notes remain untouched.
UPDATE "crm_clients"
SET "notes" = btrim(
    regexp_replace(
        "notes",
        E'(^|\\n)\\[IA OSINT -[^\\n]*(\\n|$)',
        E'\\1',
        'g'
    )
)
WHERE "notes" LIKE '%[IA OSINT -%';
