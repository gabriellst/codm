CREATE SCHEMA "artifact";
--> statement-breakpoint
CREATE SCHEMA "issue";
--> statement-breakpoint
CREATE SCHEMA "thread";
--> statement-breakpoint
CREATE SCHEMA "workspace";
--> statement-breakpoint
CREATE TABLE "artifact"."artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"issue_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"ref" text NOT NULL,
	"meta" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue"."issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"provider" text NOT NULL,
	"meta" text,
	"archived" boolean DEFAULT false NOT NULL,
	"archive_reason" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue"."stop_policy_config" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"server_errors" boolean DEFAULT true NOT NULL,
	"blocked_by_classification" boolean DEFAULT true NOT NULL,
	"human_requested" boolean DEFAULT true NOT NULL,
	"approval_needed" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue"."stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolution" text,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "issue"."terminal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"line" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thread"."thread_clarifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"sender_external_id" text NOT NULL,
	"question" text NOT NULL,
	"candidate_issue_ids" jsonb NOT NULL,
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "thread"."threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"contact_external_id" text NOT NULL,
	"contact_display_name" text NOT NULL,
	"contact_kind" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"providers" text[] NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"mention_gate_enabled" boolean DEFAULT false NOT NULL,
	"mention_gate_tag" text,
	"participants" jsonb NOT NULL,
	"buffer_size" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thread"."transcript_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"issue_id" uuid,
	"quoted_entry_id" uuid,
	"sender_external_id" text,
	"provider" text,
	"classification" text,
	"at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace"."workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"path" text NOT NULL,
	"badges" text[] NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "artifacts_thread_id_idx" ON "artifact"."artifacts" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "artifacts_issue_id_idx" ON "artifact"."artifacts" USING btree ("issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_thread_key_unq" ON "issue"."issues" USING btree ("thread_id","key");--> statement-breakpoint
CREATE INDEX "issues_owner_status_idx" ON "issue"."issues" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "issues_thread_id_idx" ON "issue"."issues" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "issues_completed_at_idx" ON "issue"."issues" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "stops_issue_id_idx" ON "issue"."stops" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "stops_thread_id_idx" ON "issue"."stops" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "terminal_lines_issue_seq_unq" ON "issue"."terminal_lines" USING btree ("issue_id","seq");--> statement-breakpoint
CREATE INDEX "thread_clarifications_thread_sender_idx" ON "thread"."thread_clarifications" USING btree ("thread_id","sender_external_id");--> statement-breakpoint
CREATE INDEX "threads_owner_id_idx" ON "thread"."threads" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "threads_owner_channel_contact_unq" ON "thread"."threads" USING btree ("owner_id","channel_id","contact_external_id");--> statement-breakpoint
CREATE INDEX "threads_workspace_id_idx" ON "thread"."threads" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "transcript_entries_thread_at_idx" ON "thread"."transcript_entries" USING btree ("thread_id","at");--> statement-breakpoint
CREATE INDEX "transcript_entries_issue_id_idx" ON "thread"."transcript_entries" USING btree ("issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_owner_path_unq" ON "workspace"."workspaces" USING btree ("owner_id","path");--> statement-breakpoint
CREATE INDEX "workspaces_owner_id_idx" ON "workspace"."workspaces" USING btree ("owner_id");