CREATE SCHEMA "gateway";
--> statement-breakpoint
CREATE TABLE "gateway"."channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'DISCONNECTED' NOT NULL,
	"account_detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "channels_owner_kind_idx" ON "gateway"."channels" USING btree ("owner_id","kind");