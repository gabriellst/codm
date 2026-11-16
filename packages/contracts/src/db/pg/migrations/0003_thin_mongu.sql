CREATE SCHEMA "panel";
--> statement-breakpoint
CREATE TABLE "panel"."panel_daemons" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panel"."panel_groups" (
	"thread_id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "panel"."panel_issues" (
	"issue_id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"life_state" text NOT NULL,
	"waiting_for_provider_until" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"timeline" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "panel_issues_status_check" CHECK ("panel"."panel_issues"."status" IN ('NEEDS_INPUT', 'WORKING', 'COMPLETED')),
	CONSTRAINT "panel_issues_life_state_check" CHECK ("panel"."panel_issues"."life_state" IN ('RUNNING', 'QUEUED', 'WAITING_PROVIDER', 'WAITING_PERSON', 'REMINDED', 'STALLED', 'DONE'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "panel_groups_token_unq" ON "panel"."panel_groups" USING btree ("token");--> statement-breakpoint
CREATE INDEX "panel_groups_owner_idx" ON "panel"."panel_groups" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "panel_issues_thread_idx" ON "panel"."panel_issues" USING btree ("thread_id");