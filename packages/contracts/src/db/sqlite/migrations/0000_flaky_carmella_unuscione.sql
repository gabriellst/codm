CREATE TABLE `authentication_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`account_id` text NOT NULL,
	`password` text,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`scope` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `authentication_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `artifact_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`issue_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`ref` text NOT NULL,
	`meta` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "artifact_artifacts_kind_check" CHECK("artifact_artifacts"."kind" IN ('IMAGE', 'FILE', 'LINK'))
);
--> statement-breakpoint
CREATE INDEX `artifacts_thread_id_idx` ON `artifact_artifacts` (`thread_id`);--> statement-breakpoint
CREATE INDEX `artifacts_issue_id_idx` ON `artifact_artifacts` (`issue_id`);--> statement-breakpoint
CREATE TABLE `gateway_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`platform` text NOT NULL,
	`name` text NOT NULL,
	`owner_remote_id` text DEFAULT '' NOT NULL,
	`credentials` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "gateway_channels_platform_check" CHECK("gateway_channels"."platform" IN ('WHATSAPP', 'INTERNAL')),
	CONSTRAINT "gateway_channels_status_check" CHECK("gateway_channels"."status" IN ('CREATED', 'CONNECTING', 'CONNECTED', 'DISCONNECTED', 'DELETED'))
);
--> statement-breakpoint
CREATE INDEX `idx_channels_owner_id` ON `gateway_channels` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_channels_owner_platform` ON `gateway_channels` (`owner_id`,`platform`);--> statement-breakpoint
CREATE TABLE `thread_consumed_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`platform_message_id` text NOT NULL,
	`thread_id` text,
	`entry_id` text,
	`consumed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consumed_messages_channel_message_unq` ON `thread_consumed_messages` (`channel_id`,`platform_message_id`);--> statement-breakpoint
CREATE TABLE `shared_events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`entity_id` text,
	`owner_id` text,
	`payload` text NOT NULL,
	`source` text NOT NULL,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_entity_idx` ON `shared_events` (`entity_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `events_name_idx` ON `shared_events` (`name`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_billing_webhook_received_entity_unq` ON `shared_events` (`entity_id`) WHERE name = 'billing.webhook.received';--> statement-breakpoint
CREATE TABLE `shared_idempotency_keys` (
	`key` text NOT NULL,
	`scope` text NOT NULL,
	`response_body` text,
	`response_status` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`key`, `scope`)
);
--> statement-breakpoint
CREATE INDEX `idempotency_expires_idx` ON `shared_idempotency_keys` (`expires_at`);--> statement-breakpoint
CREATE TABLE `issue_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`provider` text NOT NULL,
	`meta` text,
	`archived` integer DEFAULT false NOT NULL,
	`archive_reason` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "issue_issues_status_check" CHECK("issue_issues"."status" IN ('NEEDS_INPUT', 'WORKING', 'COMPLETED')),
	CONSTRAINT "issue_issues_provider_check" CHECK("issue_issues"."provider" IN ('CLAUDE_CODE', 'CODEX', 'OPENCODE')),
	CONSTRAINT "issue_issues_archive_reason_check" CHECK("issue_issues"."archive_reason" IN ('MANUAL', 'AUTO_24H', 'THREAD_DETACHED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issues_thread_key_unq` ON `issue_issues` (`thread_id`,`key`);--> statement-breakpoint
CREATE INDEX `issues_owner_status_idx` ON `issue_issues` (`owner_id`,`status`);--> statement-breakpoint
CREATE INDEX `issues_thread_id_idx` ON `issue_issues` (`thread_id`);--> statement-breakpoint
CREATE INDEX `issues_completed_at_idx` ON `issue_issues` (`completed_at`);--> statement-breakpoint
CREATE TABLE `gateway_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`remote_id` text NOT NULL,
	`platform_message_id` text NOT NULL,
	`direction` text NOT NULL,
	`platform` text NOT NULL,
	`sender_remote_id` text NOT NULL,
	`content` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`observed_at` integer NOT NULL,
	`delivered_at` integer,
	`seen_at` integer,
	`edited_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "gateway_messages_direction_check" CHECK("gateway_messages"."direction" IN ('SENT', 'RECEIVED')),
	CONSTRAINT "gateway_messages_platform_check" CHECK("gateway_messages"."platform" IN ('WHATSAPP', 'INTERNAL'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_messages_channel_platform` ON `gateway_messages` (`channel_id`,`platform_message_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_remote` ON `gateway_messages` (`channel_id`,`remote_id`,"occurred_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_messages_channel` ON `gateway_messages` (`channel_id`,"occurred_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_messages_channel_remote_occurred` ON `gateway_messages` (`channel_id`,`remote_id`,"occurred_at" DESC) WHERE "gateway_messages"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `shared_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`entity_id` text,
	`owner_id` text,
	`payload` text NOT NULL,
	`source` text NOT NULL,
	`processed_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `outbox_unprocessed_idx` ON `shared_outbox` (`source`,`processed_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `owner_owners` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`responsible_user_id` text NOT NULL,
	`picture_url` text,
	`timezone` text,
	`is_disabled` integer DEFAULT false NOT NULL,
	`disabled_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "owner_owners_kind_check" CHECK("owner_owners"."kind" IN ('ORGANIZATION', 'INDIVIDUAL'))
);
--> statement-breakpoint
CREATE INDEX `owners_is_disabled_idx` ON `owner_owners` (`is_disabled`);--> statement-breakpoint
CREATE INDEX `owners_responsible_user_id_idx` ON `owner_owners` (`responsible_user_id`);--> statement-breakpoint
CREATE TABLE `gateway_remote_memberships` (
	`channel_id` text NOT NULL,
	`group_id` text NOT NULL,
	`member_id` text NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`channel_id`, `group_id`, `member_id`),
	FOREIGN KEY (`channel_id`,`group_id`) REFERENCES `gateway_remotes`(`channel_id`,`remote_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `gateway_remotes` (
	`channel_id` text NOT NULL,
	`remote_id` text NOT NULL,
	`type` text NOT NULL,
	`platform` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`avatar_url` text,
	`is_blocked` integer DEFAULT false NOT NULL,
	`pinned_at` integer,
	`archived` integer DEFAULT false NOT NULL,
	`mute_expiration` integer,
	`marked_as_unread` integer DEFAULT false NOT NULL,
	`unread_message_count` integer DEFAULT 0 NOT NULL,
	`last_message_at` integer,
	`last_message_id` text,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`channel_id`, `remote_id`),
	CONSTRAINT "gateway_remotes_type_check" CHECK("gateway_remotes"."type" IN ('USER', 'GROUP', 'BROADCAST')),
	CONSTRAINT "gateway_remotes_platform_check" CHECK("gateway_remotes"."platform" IN ('WHATSAPP', 'INTERNAL'))
);
--> statement-breakpoint
CREATE INDEX `idx_remotes_last_message_at` ON `gateway_remotes` (`channel_id`,"last_message_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_remotes_type` ON `gateway_remotes` (`channel_id`,`type`);--> statement-breakpoint
CREATE INDEX `idx_remotes_pinned` ON `gateway_remotes` (`channel_id`,"pinned_at" DESC) WHERE "gateway_remotes"."pinned_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_remotes_avatar_missing` ON `gateway_remotes` (`channel_id`,`remote_id`) WHERE "gateway_remotes"."avatar_url" IS NULL AND "gateway_remotes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `shared_scheduled_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`input` text NOT NULL,
	`run_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`lease_until` integer,
	`repeat_every_ms` integer,
	`dead_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scheduled_commands_due_idx` ON `shared_scheduled_commands` (`run_at`) WHERE dead_at IS NULL;--> statement-breakpoint
CREATE TABLE `authentication_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`active_owner_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `authentication_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authentication_sessions_token_unique` ON `authentication_sessions` (`token`);--> statement-breakpoint
CREATE TABLE `issue_stop_policy_config` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`server_errors` integer DEFAULT true NOT NULL,
	`blocked_by_classification` integer DEFAULT true NOT NULL,
	`human_requested` integer DEFAULT true NOT NULL,
	`approval_needed` integer DEFAULT true NOT NULL,
	`auth_required` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `issue_stops` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`raised_at` integer NOT NULL,
	`resolution` text,
	`resolved_at` integer,
	CONSTRAINT "issue_stops_kind_check" CHECK("issue_stops"."kind" IN ('SERVER_ERROR', 'BLOCKED_BY_CLASSIFICATION', 'HUMAN_REQUESTED', 'APPROVAL_NEEDED', 'AUTH_REQUIRED')),
	CONSTRAINT "issue_stops_resolution_check" CHECK("issue_stops"."resolution" IN ('RETRY', 'REVIEW_AND_SEND', 'TAKE_OVER', 'APPROVE', 'DENY'))
);
--> statement-breakpoint
CREATE INDEX `stops_issue_id_idx` ON `issue_stops` (`issue_id`);--> statement-breakpoint
CREATE INDEX `stops_thread_id_idx` ON `issue_stops` (`thread_id`);--> statement-breakpoint
CREATE TABLE `terminal_terminal_llm_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`provider` text NOT NULL,
	`cwd` text NOT NULL,
	`claude_session_id` text NOT NULL,
	`last_turn_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "terminal_terminal_llm_sessions_provider_check" CHECK("terminal_terminal_llm_sessions"."provider" IN ('CLAUDE_CODE', 'CODEX', 'OPENCODE'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `terminal_llm_sessions_issue_unq` ON `terminal_terminal_llm_sessions` (`issue_id`);--> statement-breakpoint
CREATE INDEX `terminal_llm_sessions_last_turn_idx` ON `terminal_terminal_llm_sessions` (`last_turn_at`);--> statement-breakpoint
CREATE TABLE `issue_terminal_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`seq` integer NOT NULL,
	`line` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `terminal_lines_issue_seq_unq` ON `issue_terminal_lines` (`issue_id`,`seq`);--> statement-breakpoint
CREATE TABLE `thread_thread_clarifications` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`sender_external_id` text NOT NULL,
	`question` text NOT NULL,
	`candidate_issue_ids` text NOT NULL,
	`asked_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE INDEX `thread_clarifications_thread_sender_idx` ON `thread_thread_clarifications` (`thread_id`,`sender_external_id`);--> statement-breakpoint
CREATE TABLE `thread_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`contact_external_id` text NOT NULL,
	`contact_display_name` text NOT NULL,
	`contact_kind` text NOT NULL,
	`workspace_id` text NOT NULL,
	`providers` text NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`mention_gate_enabled` integer DEFAULT false NOT NULL,
	`mention_gate_tag` text,
	`participants` text NOT NULL,
	`buffer_size` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "thread_threads_contact_kind_check" CHECK("thread_threads"."contact_kind" IN ('USER', 'GROUP', 'BROADCAST')),
	CONSTRAINT "thread_threads_buffer_size_check" CHECK("thread_threads"."buffer_size" IN ('25', '50', '100', '200')),
	CONSTRAINT "thread_threads_status_check" CHECK("thread_threads"."status" IN ('RUNNING', 'IDLE', 'NEEDS_ATTENTION', 'PAUSED'))
);
--> statement-breakpoint
CREATE INDEX `threads_owner_id_idx` ON `thread_threads` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `threads_owner_channel_contact_unq` ON `thread_threads` (`owner_id`,`channel_id`,`contact_external_id`);--> statement-breakpoint
CREATE INDEX `threads_workspace_id_idx` ON `thread_threads` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `thread_transcript_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`issue_id` text,
	`quoted_entry_id` text,
	`sender_external_id` text,
	`provider` text,
	`classification` text,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "thread_transcript_entries_kind_check" CHECK("thread_transcript_entries"."kind" IN ('CONTACT', 'AGENT', 'OPERATOR_DIRECT', 'WHISPER', 'ACTION')),
	CONSTRAINT "thread_transcript_entries_provider_check" CHECK("thread_transcript_entries"."provider" IN ('CLAUDE_CODE', 'CODEX', 'OPENCODE')),
	CONSTRAINT "thread_transcript_entries_classification_check" CHECK("thread_transcript_entries"."classification" IN ('REPLY_QUOTE', 'CONTEXT_MATCH', 'NEW_ISSUE', 'CLARIFIED'))
);
--> statement-breakpoint
CREATE INDEX `transcript_entries_thread_at_idx` ON `thread_transcript_entries` (`thread_id`,`at`);--> statement-breakpoint
CREATE INDEX `transcript_entries_issue_id_idx` ON `thread_transcript_entries` (`issue_id`);--> statement-breakpoint
CREATE TABLE `authentication_user_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`timezone` text,
	`language` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `authentication_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `authentication_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`name` text,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authentication_users_email_unique` ON `authentication_users` (`email`);--> statement-breakpoint
CREATE TABLE `authentication_verification_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`path` text NOT NULL,
	`badges` text NOT NULL,
	`added_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_owner_path_unq` ON `workspace_workspaces` (`owner_id`,`path`);--> statement-breakpoint
CREATE INDEX `workspaces_owner_id_idx` ON `workspace_workspaces` (`owner_id`);