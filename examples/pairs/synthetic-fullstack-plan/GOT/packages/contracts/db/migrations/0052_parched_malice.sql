CREATE SCHEMA "procurement";
--> statement-breakpoint
CREATE TABLE "procurement"."purchase_order_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"supplier_name" text NOT NULL,
	"status" text NOT NULL,
	"total_amount_cents" bigint NOT NULL,
	"total_amount_currency" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procurement"."purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"supplier_name" text NOT NULL,
	"status" text NOT NULL,
	"total_amount_cents" bigint NOT NULL,
	"total_amount_currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "purchase_order_audit_order_id_idx" ON "procurement"."purchase_order_audit" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_order_audit_store_id_idx" ON "procurement"."purchase_order_audit" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_store_id_idx" ON "procurement"."purchase_orders" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_idx" ON "procurement"."purchase_orders" USING btree ("status");