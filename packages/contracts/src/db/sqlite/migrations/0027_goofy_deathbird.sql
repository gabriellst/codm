PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`issue_id` text,
	`thread_id` text NOT NULL,
	`provider` text NOT NULL,
	`cwd` text NOT NULL,
	`agent_session_id` text NOT NULL,
	`model` text DEFAULT 'DEFAULT' NOT NULL,
	`last_message_id` text,
	`last_context_tokens` integer,
	`last_turn_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "agent_agent_sessions_provider_check" CHECK("__new_agent_agent_sessions"."provider" IN ('CLAUDE_CODE', 'CODEX', 'OPENCODE')),
	CONSTRAINT "agent_agent_sessions_model_check" CHECK("__new_agent_agent_sessions"."model" IN ('DEFAULT', 'SONNET', 'OPUS', 'HAIKU', 'GPT_5_3_CODEX', 'GPT_5_2_CODEX', 'GPT_5_1_CODEX'))
);
--> statement-breakpoint
INSERT INTO `__new_agent_agent_sessions`("id", "owner_id", "issue_id", "thread_id", "provider", "cwd", "agent_session_id", "model", "last_message_id", "last_context_tokens", "last_turn_at", "created_at", "updated_at", "version") SELECT "id", "owner_id", "issue_id", "thread_id", "provider", "cwd", "agent_session_id", "model", "last_message_id", "last_context_tokens", "last_turn_at", "created_at", "updated_at", "version" FROM `agent_agent_sessions`;--> statement-breakpoint
DROP TABLE `agent_agent_sessions`;--> statement-breakpoint
ALTER TABLE `__new_agent_agent_sessions` RENAME TO `agent_agent_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_sessions_issue_unq` ON `agent_agent_sessions` (`issue_id`) WHERE issue_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_sessions_orchestrator_unq` ON `agent_agent_sessions` (`thread_id`) WHERE issue_id IS NULL;--> statement-breakpoint
CREATE INDEX `agent_sessions_last_turn_idx` ON `agent_agent_sessions` (`last_turn_at`);