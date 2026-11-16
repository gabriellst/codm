CREATE TABLE "panel"."panel_code_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"member_id" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"code_hash" text,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "panel"."panel_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"member_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "panel"."panel_groups" ADD COLUMN "members" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "panel_code_requests_member_idx" ON "panel"."panel_code_requests" USING btree ("thread_id","member_id","requested_at");--> statement-breakpoint
CREATE INDEX "panel_code_requests_owner_idx" ON "panel"."panel_code_requests" USING btree ("owner_id","requested_at");--> statement-breakpoint
CREATE INDEX "panel_sessions_thread_idx" ON "panel"."panel_sessions" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "panel_sessions_owner_idx" ON "panel"."panel_sessions" USING btree ("owner_id","expires_at");