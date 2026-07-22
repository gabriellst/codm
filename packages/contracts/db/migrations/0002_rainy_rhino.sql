ALTER TABLE "shared"."events" ALTER COLUMN "entity_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "shared"."outbox" ALTER COLUMN "entity_id" SET DATA TYPE text;