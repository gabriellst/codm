ALTER TABLE "panel"."panel_issues" DROP CONSTRAINT "panel_issues_life_state_check";--> statement-breakpoint
ALTER TABLE "panel"."panel_issues" ADD COLUMN "retrying_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "panel"."panel_issues" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "panel"."panel_issues" ADD CONSTRAINT "panel_issues_life_state_check" CHECK ("panel"."panel_issues"."life_state" IN ('RUNNING', 'QUEUED', 'WAITING_PROVIDER', 'WAITING_RETRY', 'WAITING_BUDGET', 'WAITING_PERSON', 'REMINDED', 'STALLED', 'PAUSED', 'DONE'));