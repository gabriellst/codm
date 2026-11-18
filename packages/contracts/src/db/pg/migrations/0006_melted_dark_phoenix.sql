CREATE TABLE "panel"."panel_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"member_id" text NOT NULL,
	"session_hash" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"outcome" text,
	"outcome_code" text,
	"outcome_at" timestamp with time zone,
	CONSTRAINT "panel_actions_kind_check" CHECK ("panel"."panel_actions"."kind" IN ('PAUSE', 'RESUME', 'STEER', 'ANSWER_STOP')),
	CONSTRAINT "panel_actions_outcome_check" CHECK ("panel"."panel_actions"."outcome" IN ('DONE', 'REFUSED'))
);
--> statement-breakpoint
ALTER TABLE "panel"."panel_groups" ADD COLUMN "open_stops" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "panel_actions_owner_idx" ON "panel"."panel_actions" USING btree ("owner_id","requested_at");--> statement-breakpoint
CREATE INDEX "panel_actions_session_idx" ON "panel"."panel_actions" USING btree ("session_hash","requested_at");--> statement-breakpoint
CREATE INDEX "panel_actions_thread_idx" ON "panel"."panel_actions" USING btree ("thread_id");