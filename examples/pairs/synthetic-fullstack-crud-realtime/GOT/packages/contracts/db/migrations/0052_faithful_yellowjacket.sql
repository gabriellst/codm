CREATE SCHEMA "procurement";
--> statement-breakpoint
CREATE TABLE "procurement"."purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"supplier_name" text NOT NULL,
	"status" text NOT NULL,
	"total_amount_cents" bigint NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "purchase_orders_store_id_idx" ON "procurement"."purchase_orders" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_idx" ON "procurement"."purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_orders_store_created_idx" ON "procurement"."purchase_orders" USING btree ("store_id","created_at");