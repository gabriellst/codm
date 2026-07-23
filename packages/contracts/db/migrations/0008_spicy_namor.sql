CREATE SCHEMA "terminal";
--> statement-breakpoint
CREATE TABLE "terminal"."terminal_llm_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"cwd" text NOT NULL,
	"claude_session_id" text NOT NULL,
	"last_turn_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "terminal_llm_sessions_issue_unq" ON "terminal"."terminal_llm_sessions" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "terminal_llm_sessions_last_turn_idx" ON "terminal"."terminal_llm_sessions" USING btree ("last_turn_at");