CREATE SCHEMA "activity";
--> statement-breakpoint
CREATE TABLE "activity"."activity_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"first_occurred_at" timestamp with time zone NOT NULL,
	"last_occurred_at" timestamp with time zone NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "activity_entries_owner_event_entity_unq" ON "activity"."activity_entries" USING btree ("owner_id","event_name","entity_id");--> statement-breakpoint
CREATE INDEX "activity_entries_owner_last_occurred_at_idx" ON "activity"."activity_entries" USING btree ("owner_id","last_occurred_at");