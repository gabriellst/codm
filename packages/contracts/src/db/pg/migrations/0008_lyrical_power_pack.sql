CREATE TABLE "panel"."panel_batches" (
	"thread_id" text NOT NULL,
	"code" text NOT NULL,
	"owner_id" text NOT NULL,
	"batch" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "panel_batches_thread_id_code_pk" PRIMARY KEY("thread_id","code")
);
--> statement-breakpoint
ALTER TABLE "panel"."panel_issues" DROP CONSTRAINT "panel_issues_life_state_check";--> statement-breakpoint
ALTER TABLE "panel"."panel_daemons" ADD COLUMN "health" jsonb;--> statement-breakpoint
CREATE INDEX "panel_batches_owner_idx" ON "panel"."panel_batches" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "panel"."panel_issues" ADD CONSTRAINT "panel_issues_life_state_check" CHECK ("panel"."panel_issues"."life_state" IN ('RUNNING', 'QUEUED', 'WAITING_PROVIDER', 'WAITING_BUDGET', 'WAITING_PERSON', 'REMINDED', 'STALLED', 'PAUSED', 'DONE'));