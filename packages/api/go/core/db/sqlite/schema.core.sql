-- DERIVADO — não edite à mão. Gerado por scripts/db/split-sqlite-schema.ts a partir de
-- packages/api/go/core/db/sqlite/schema.sql, mantendo só as tabelas do lado "core".
-- Regenerar: bun scripts/db/split-sqlite-schema.ts   ·   Conferir: … --check
CREATE TABLE "shared_events" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"entity_id" text,
	"owner_id" text,
	"payload" text NOT NULL,
	"source" text NOT NULL,
	"occurred_at" integer NOT NULL
);
CREATE TABLE "shared_idempotency_keys" (
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"response_body" text,
	"response_status" integer,
	"expires_at" integer,
	"created_at" integer NOT NULL,
	PRIMARY KEY("key", "scope")
);
CREATE TABLE "shared_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"entity_id" text,
	"owner_id" text,
	"payload" text NOT NULL,
	"source" text NOT NULL,
	"processed_at" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" integer NOT NULL
, "claimed_by" text, "lease_until" integer);
CREATE TABLE "shared_scheduled_commands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"input" text NOT NULL,
	"run_at" integer NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"lease_until" integer,
	"repeat_every_ms" integer,
	"dead_at" integer,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
CREATE UNIQUE INDEX "events_billing_webhook_received_entity_unq" ON "shared_events" ("entity_id") WHERE name = 'billing.webhook.received';
CREATE INDEX "events_entity_idx" ON "shared_events" ("entity_id","occurred_at");
CREATE INDEX "events_name_idx" ON "shared_events" ("name","occurred_at");
CREATE INDEX "idempotency_expires_idx" ON "shared_idempotency_keys" ("expires_at");
CREATE INDEX "outbox_claim_idx" ON "shared_outbox" ("source","processed_at","lease_until");
CREATE INDEX "outbox_unprocessed_idx" ON "shared_outbox" ("source","processed_at","created_at");
CREATE INDEX "scheduled_commands_due_idx" ON "shared_scheduled_commands" ("run_at") WHERE dead_at IS NULL;
