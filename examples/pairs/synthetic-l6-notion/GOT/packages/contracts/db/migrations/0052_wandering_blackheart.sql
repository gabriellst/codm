CREATE SCHEMA "workspace";
--> statement-breakpoint
CREATE SCHEMA "page";
--> statement-breakpoint
CREATE TABLE "workspace"."workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page"."blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"page_id" uuid NOT NULL,
	"parent_block_id" uuid,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page"."page_view_projection" (
	"page_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"block_tree" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"child_pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page"."pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"parent_page_id" uuid,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "workspaces_owner_id_idx" ON "workspace"."workspaces" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "blocks_page_id_idx" ON "page"."blocks" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "blocks_parent_block_id_idx" ON "page"."blocks" USING btree ("parent_block_id");--> statement-breakpoint
CREATE INDEX "page_view_projection_workspace_id_idx" ON "page"."page_view_projection" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "pages_workspace_id_idx" ON "page"."pages" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "pages_parent_page_id_idx" ON "page"."pages" USING btree ("parent_page_id");