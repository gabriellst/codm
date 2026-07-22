CREATE SCHEMA "clickup";
--> statement-breakpoint
CREATE TABLE "clickup"."clickup_board_view" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"status" text NOT NULL,
	"list_id" uuid NOT NULL,
	"title" text NOT NULL,
	"priority" text NOT NULL,
	"assignee_ids" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clickup"."clickup_list_view" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"priority" text NOT NULL,
	"assignee_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clickup"."lists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clickup"."spaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clickup"."tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"priority" text NOT NULL,
	"assignee_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clickup"."workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "clickup_board_view_space_status_idx" ON "clickup"."clickup_board_view" USING btree ("space_id","status");--> statement-breakpoint
CREATE INDEX "clickup_list_view_space_list_idx" ON "clickup"."clickup_list_view" USING btree ("space_id","list_id");--> statement-breakpoint
CREATE INDEX "lists_space_id_idx" ON "clickup"."lists" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "spaces_workspace_id_idx" ON "clickup"."spaces" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "tasks_space_id_idx" ON "clickup"."tasks" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "tasks_list_id_idx" ON "clickup"."tasks" USING btree ("list_id");