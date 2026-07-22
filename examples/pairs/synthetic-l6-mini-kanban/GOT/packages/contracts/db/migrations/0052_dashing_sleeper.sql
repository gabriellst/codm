CREATE SCHEMA "kanban";
--> statement-breakpoint
CREATE TABLE "kanban"."board_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban"."boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"title" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban"."cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "board_lists_board_id_idx" ON "kanban"."board_lists" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "boards_store_id_idx" ON "kanban"."boards" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "cards_board_id_idx" ON "kanban"."cards" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "cards_list_id_idx" ON "kanban"."cards" USING btree ("list_id");