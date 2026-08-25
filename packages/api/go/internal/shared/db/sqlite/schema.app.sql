-- DERIVADO — não edite à mão. Gerado por scripts/db/split-sqlite-schema.ts a partir de
-- packages/api/go/core/db/sqlite/schema.sql, mantendo só as tabelas do lado "app".
-- Regenerar: bun scripts/db/split-sqlite-schema.ts   ·   Conferir: … --check
CREATE TABLE "agent_agent_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"issue_id" text,
	"thread_id" text NOT NULL,
	"provider" text NOT NULL,
	"cwd" text NOT NULL,
	"agent_session_id" text NOT NULL,
	"model" text DEFAULT 'DEFAULT' NOT NULL,
	"last_message_id" text,
	"last_context_tokens" integer,
	"last_turn_at" integer NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "agent_agent_sessions_provider_check" CHECK("agent_agent_sessions"."provider" IN ('CLAUDE_CODE', 'CODEX', 'OPENCODE')),
	CONSTRAINT "agent_agent_sessions_model_check" CHECK("agent_agent_sessions"."model" IN ('DEFAULT', 'SONNET', 'OPUS', 'HAIKU'))
);
CREATE TABLE "agent_mailbox" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" text NOT NULL,
	"dedup_key" text NOT NULL,
	"claimed_by" text,
	"lease_until" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"dead_at" integer,
	"consumed_at" integer,
	"created_at" integer NOT NULL,
	CONSTRAINT "agent_mailbox_target_kind_check" CHECK("agent_mailbox"."target_kind" IN ('THREAD', 'ISSUE')),
	CONSTRAINT "agent_mailbox_kind_check" CHECK("agent_mailbox"."kind" IN ('OPERATOR_MESSAGE', 'ISSUE_RESULT', 'WORK', 'STEER'))
);
CREATE TABLE "artifact_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"issue_id" text,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"ref" text NOT NULL,
	"meta" text NOT NULL,
	"recorded_at" integer NOT NULL,
	"created_at" integer NOT NULL,
	CONSTRAINT "artifact_artifacts_kind_check" CHECK("artifact_artifacts"."kind" IN ('IMAGE', 'AUDIO', 'VIDEO', 'FILE', 'LINK'))
);
CREATE TABLE "authentication_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" integer,
	"scope" text,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL, "refresh_token_expires_at" integer,
	FOREIGN KEY ("user_id") REFERENCES "authentication_users"("id") ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "authentication_device_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" integer NOT NULL,
	"consumed_at" integer,
	"created_at" integer NOT NULL,
	FOREIGN KEY ("user_id") REFERENCES "authentication_users"("id") ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "authentication_device_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"revoked_at" integer,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	FOREIGN KEY ("user_id") REFERENCES "authentication_users"("id") ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "authentication_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" integer NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_owner_id" text,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	FOREIGN KEY ("user_id") REFERENCES "authentication_users"("id") ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "authentication_user_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"timezone" text,
	"language" text,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	FOREIGN KEY ("id") REFERENCES "authentication_users"("id") ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "authentication_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified" integer DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
CREATE TABLE "authentication_verification_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" integer NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
CREATE TABLE "gateway_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"platform" text NOT NULL,
	"name" text NOT NULL,
	"owner_remote_id" text DEFAULT '' NOT NULL,
	"credentials" text NOT NULL,
	"status" text NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "gateway_channels_platform_check" CHECK("gateway_channels"."platform" IN ('WHATSAPP', 'INTERNAL')),
	CONSTRAINT "gateway_channels_status_check" CHECK("gateway_channels"."status" IN ('CREATED', 'CONNECTING', 'CONNECTED', 'DISCONNECTED', 'DELETED'))
);
CREATE TABLE "gateway_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"remote_id" text NOT NULL,
	"platform_message_id" text NOT NULL,
	"direction" text NOT NULL,
	"platform" text NOT NULL,
	"sender_remote_id" text NOT NULL,
	"message_type" text,
	"content" text NOT NULL,
	"occurred_at" integer NOT NULL,
	"observed_at" integer NOT NULL,
	"delivered_at" integer,
	"seen_at" integer,
	"edited_at" integer,
	"deleted_at" integer,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "gateway_messages_direction_check" CHECK("gateway_messages"."direction" IN ('SENT', 'RECEIVED')),
	CONSTRAINT "gateway_messages_platform_check" CHECK("gateway_messages"."platform" IN ('WHATSAPP', 'INTERNAL')),
	CONSTRAINT "gateway_messages_message_type_check" CHECK("gateway_messages"."message_type" IN ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'LOCATION', 'CONTACT', 'POLL', 'LIST', 'BUTTON', 'REACTION', 'STATUS'))
);
CREATE TABLE "gateway_remote_memberships" (
	"channel_id" text NOT NULL,
	"group_id" text NOT NULL,
	"member_id" text NOT NULL,
	"is_admin" integer DEFAULT false NOT NULL,
	"joined_at" integer NOT NULL,
	PRIMARY KEY("channel_id", "group_id", "member_id"),
	FOREIGN KEY ("channel_id","group_id") REFERENCES "gateway_remotes"("channel_id","remote_id") ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "gateway_remotes" (
	"channel_id" text NOT NULL,
	"remote_id" text NOT NULL,
	"type" text NOT NULL,
	"platform" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"avatar_url" text,
	"is_blocked" integer DEFAULT false NOT NULL,
	"pinned_at" integer,
	"archived" integer DEFAULT false NOT NULL,
	"mute_expiration" integer,
	"marked_as_unread" integer DEFAULT false NOT NULL,
	"unread_message_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" integer,
	"last_message_id" text,
	"deleted_at" integer,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	PRIMARY KEY("channel_id", "remote_id"),
	CONSTRAINT "gateway_remotes_type_check" CHECK("gateway_remotes"."type" IN ('USER', 'GROUP', 'BROADCAST')),
	CONSTRAINT "gateway_remotes_platform_check" CHECK("gateway_remotes"."platform" IN ('WHATSAPP', 'INTERNAL'))
);
CREATE TABLE "issue_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"provider" text NOT NULL,
	"meta" text,
	"archived" integer DEFAULT false NOT NULL,
	"archive_reason" text,
	"completed_at" integer,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL, "origin_entry_id" text, "goal" text,
	CONSTRAINT "issue_issues_status_check" CHECK("issue_issues"."status" IN ('NEEDS_INPUT', 'WORKING', 'COMPLETED')),
	CONSTRAINT "issue_issues_provider_check" CHECK("issue_issues"."provider" IN ('CLAUDE_CODE', 'CODEX', 'OPENCODE')),
	CONSTRAINT "issue_issues_archive_reason_check" CHECK("issue_issues"."archive_reason" IN ('MANUAL', 'AUTO_24H', 'THREAD_DETACHED'))
);
CREATE TABLE "issue_stop_policy_config" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"server_errors" integer DEFAULT true NOT NULL,
	"blocked_by_classification" integer DEFAULT true NOT NULL,
	"human_requested" integer DEFAULT true NOT NULL,
	"approval_needed" integer DEFAULT true NOT NULL,
	"auth_required" integer DEFAULT true NOT NULL,
	"updated_at" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
CREATE TABLE "issue_stops" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"issue_id" text,
	"thread_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"raised_at" integer NOT NULL,
	"resolution" text,
	"resolved_at" integer,
	CONSTRAINT "issue_stops_kind_check" CHECK("issue_stops"."kind" IN ('SERVER_ERROR', 'BLOCKED_BY_CLASSIFICATION', 'HUMAN_REQUESTED', 'APPROVAL_NEEDED', 'AUTH_REQUIRED')),
	CONSTRAINT "issue_stops_resolution_check" CHECK("issue_stops"."resolution" IN ('RETRY', 'REVIEW_AND_SEND', 'TAKE_OVER', 'APPROVE', 'DENY'))
);
CREATE TABLE "issue_terminal_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"seq" integer NOT NULL,
	"line" text NOT NULL,
	"at" integer NOT NULL
);
CREATE TABLE "owner_onboardings" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"current_step" text NOT NULL,
	"completed_at" integer,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "owner_onboardings_current_step_check" CHECK("owner_onboardings"."current_step" IN ('VALUE', 'HOW', 'CONTROL', 'CHANNEL', 'WORKSPACE', 'CONTACT', 'AGENTS', 'REVIEW', 'FINAL'))
);
CREATE TABLE "owner_owners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"responsible_user_id" text NOT NULL,
	"picture_url" text,
	"timezone" text,
	"is_disabled" integer DEFAULT false NOT NULL,
	"disabled_reason" text,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "owner_owners_kind_check" CHECK("owner_owners"."kind" IN ('ORGANIZATION', 'INDIVIDUAL'))
);
CREATE TABLE "thread_consumed_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"platform_message_id" text NOT NULL,
	"thread_id" text,
	"entry_id" text,
	"consumed_at" integer NOT NULL
);
CREATE TABLE "thread_loops" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"prompt" text NOT NULL,
	"kind" text DEFAULT 'DAILY' NOT NULL,
	"time_of_day" text,
	"weekdays" text,
	"timezone" text,
	"every_minutes" integer,
	"enabled" integer DEFAULT true NOT NULL,
	"next_run_at" integer,
	"last_fired_at" integer,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "thread_loops_kind_check" CHECK("thread_loops"."kind" IN ('DAILY', 'INTERVAL'))
);
CREATE TABLE "thread_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"contact_external_id" text NOT NULL,
	"contact_display_name" text NOT NULL,
	"contact_kind" text NOT NULL,
	"workspace_id" text NOT NULL,
	"providers" text NOT NULL,
	"paused" integer DEFAULT false NOT NULL,
	"mention_gate_enabled" integer DEFAULT false NOT NULL,
	"mention_gate_tag" text,
	"participants" text NOT NULL,
	"buffer_size" text NOT NULL,
	"status" text NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL, "deleted_at" integer, "custom_prompt" text, "model_by_provider" text DEFAULT '{}' NOT NULL, "thinking_indicator_enabled" integer DEFAULT true NOT NULL, "reactions_enabled" integer DEFAULT true NOT NULL, "streaming_enabled" integer DEFAULT true NOT NULL,
	CONSTRAINT "thread_threads_contact_kind_check" CHECK("thread_threads"."contact_kind" IN ('USER', 'GROUP', 'BROADCAST')),
	CONSTRAINT "thread_threads_buffer_size_check" CHECK("thread_threads"."buffer_size" IN ('25', '50', '100', '200')),
	CONSTRAINT "thread_threads_status_check" CHECK("thread_threads"."status" IN ('RUNNING', 'IDLE', 'NEEDS_ATTENTION', 'PAUSED'))
);
CREATE TABLE "thread_transcript_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"issue_id" text,
	"quoted_entry_id" text,
	"sender_external_id" text,
	"provider" text,
	"classification" text,
	"at" integer NOT NULL,
	"created_at" integer NOT NULL, "fired_by_loop" text, "message_type" text, "media_path" text,
	CONSTRAINT "thread_transcript_entries_kind_check" CHECK("thread_transcript_entries"."kind" IN ('CONTACT', 'SYSTEM', 'DIRECT', 'WHISPER', 'ACTION')),
	CONSTRAINT "thread_transcript_entries_provider_check" CHECK("thread_transcript_entries"."provider" IN ('CLAUDE_CODE', 'CODEX', 'OPENCODE')),
	CONSTRAINT "thread_transcript_entries_classification_check" CHECK("thread_transcript_entries"."classification" IN ('REPLY_QUOTE', 'CONTEXT_MATCH', 'NEW_ISSUE', 'CLARIFIED')),
	CONSTRAINT "thread_transcript_entries_message_type_check" CHECK("thread_transcript_entries"."message_type" IN ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'LOCATION', 'CONTACT', 'POLL', 'LIST', 'BUTTON', 'REACTION', 'STATUS'))
);
CREATE TABLE "workspace_workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"path" text NOT NULL,
	"badges" text NOT NULL,
	"added_at" integer NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
CREATE UNIQUE INDEX "agent_mailbox_dedup_unq" ON "agent_mailbox" ("dedup_key");
CREATE INDEX "agent_mailbox_pending_idx" ON "agent_mailbox" ("target_kind","target_id","consumed_at","created_at") WHERE dead_at IS NULL;
CREATE UNIQUE INDEX "agent_sessions_issue_unq" ON "agent_agent_sessions" ("issue_id") WHERE issue_id IS NOT NULL;
CREATE INDEX "agent_sessions_last_turn_idx" ON "agent_agent_sessions" ("last_turn_at");
CREATE UNIQUE INDEX "agent_sessions_orchestrator_unq" ON "agent_agent_sessions" ("thread_id") WHERE issue_id IS NULL;
CREATE INDEX "artifacts_issue_id_idx" ON "artifact_artifacts" ("issue_id");
CREATE INDEX "artifacts_thread_id_idx" ON "artifact_artifacts" ("thread_id");
CREATE UNIQUE INDEX "authentication_device_tokens_token_hash_unique" ON "authentication_device_tokens" ("token_hash");
CREATE UNIQUE INDEX "authentication_sessions_token_unique" ON "authentication_sessions" ("token");
CREATE UNIQUE INDEX "authentication_users_email_unique" ON "authentication_users" ("email");
CREATE UNIQUE INDEX "consumed_messages_channel_message_unq" ON "thread_consumed_messages" ("channel_id","platform_message_id");
CREATE INDEX "consumed_messages_entry_idx" ON "thread_consumed_messages" ("entry_id");
CREATE INDEX "device_tokens_user_id_idx" ON "authentication_device_tokens" ("user_id");
CREATE INDEX "idx_channels_owner_id" ON "gateway_channels" ("owner_id");
CREATE INDEX "idx_channels_owner_platform" ON "gateway_channels" ("owner_id","platform");
CREATE INDEX "idx_messages_channel" ON "gateway_messages" ("channel_id","occurred_at" DESC);
CREATE UNIQUE INDEX "idx_messages_channel_platform" ON "gateway_messages" ("channel_id","platform_message_id");
CREATE INDEX "idx_messages_channel_remote_occurred" ON "gateway_messages" ("channel_id","remote_id","occurred_at" DESC) WHERE "gateway_messages"."deleted_at" IS NULL;
CREATE INDEX "idx_messages_remote" ON "gateway_messages" ("channel_id","remote_id","occurred_at" DESC);
CREATE INDEX "idx_remotes_avatar_missing" ON "gateway_remotes" ("channel_id","remote_id") WHERE "gateway_remotes"."avatar_url" IS NULL AND "gateway_remotes"."deleted_at" IS NULL;
CREATE INDEX "idx_remotes_last_message_at" ON "gateway_remotes" ("channel_id","last_message_at" DESC);
CREATE INDEX "idx_remotes_pinned" ON "gateway_remotes" ("channel_id","pinned_at" DESC) WHERE "gateway_remotes"."pinned_at" IS NOT NULL;
CREATE INDEX "idx_remotes_type" ON "gateway_remotes" ("channel_id","type");
CREATE INDEX "issues_completed_at_idx" ON "issue_issues" ("completed_at");
CREATE INDEX "issues_owner_status_idx" ON "issue_issues" ("owner_id","status");
CREATE INDEX "issues_thread_id_idx" ON "issue_issues" ("thread_id");
CREATE UNIQUE INDEX "issues_thread_key_unq" ON "issue_issues" ("thread_id","key");
CREATE INDEX "loops_next_run_at_idx" ON "thread_loops" ("next_run_at");
CREATE INDEX "loops_thread_id_idx" ON "thread_loops" ("thread_id");
CREATE UNIQUE INDEX "onboardings_owner_id_idx" ON "owner_onboardings" ("owner_id");
CREATE INDEX "owners_is_disabled_idx" ON "owner_owners" ("is_disabled");
CREATE INDEX "owners_responsible_user_id_idx" ON "owner_owners" ("responsible_user_id");
CREATE INDEX "stops_issue_id_idx" ON "issue_stops" ("issue_id");
CREATE INDEX "stops_thread_id_idx" ON "issue_stops" ("thread_id");
CREATE UNIQUE INDEX "terminal_lines_issue_seq_unq" ON "issue_terminal_lines" ("issue_id","seq");
CREATE UNIQUE INDEX "threads_owner_channel_contact_unq" ON "thread_threads" ("owner_id","channel_id","contact_external_id");
CREATE INDEX "threads_owner_id_idx" ON "thread_threads" ("owner_id");
CREATE INDEX "threads_workspace_id_idx" ON "thread_threads" ("workspace_id");
CREATE INDEX "transcript_entries_issue_id_idx" ON "thread_transcript_entries" ("issue_id");
CREATE INDEX "transcript_entries_thread_at_idx" ON "thread_transcript_entries" ("thread_id","at");
CREATE INDEX "workspaces_owner_id_idx" ON "workspace_workspaces" ("owner_id");
CREATE UNIQUE INDEX "workspaces_owner_path_unq" ON "workspace_workspaces" ("owner_id","path");
