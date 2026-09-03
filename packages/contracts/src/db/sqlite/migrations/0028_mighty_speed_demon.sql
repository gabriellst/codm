-- HAND-ADDED, and the rebuild below is why. The three `GPT_5_*_CODEX` members this migration
-- retires never reached a release — they existed only on the unmerged codex-runner branch — but a
-- data dir that applied 0027 can hold one, and `INSERT ... SELECT` copies every row THROUGH the new
-- CHECK. A stale value would therefore abort the very boot that applies this file. Both carriers are
-- normalized first: the column back to DEFAULT, the JSON map by dropping the key, which is exactly
-- what "no model chosen" already means in each (`agent.ts` column default, `thread.ts` partial map).
UPDATE `agent_agent_sessions` SET `model` = 'DEFAULT' WHERE `model` NOT IN ('DEFAULT', 'SONNET', 'OPUS', 'HAIKU', 'TERRA', 'LUNA');--> statement-breakpoint
UPDATE `thread_threads` SET `model_by_provider` = json_remove(`model_by_provider`, '$.CODEX') WHERE json_extract(`model_by_provider`, '$.CODEX') NOT IN ('DEFAULT', 'SONNET', 'OPUS', 'HAIKU', 'TERRA', 'LUNA');--> statement-breakpoint
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
	CONSTRAINT "agent_agent_sessions_model_check" CHECK("__new_agent_agent_sessions"."model" IN ('DEFAULT', 'SONNET', 'OPUS', 'HAIKU', 'TERRA', 'LUNA'))
);
--> statement-breakpoint
INSERT INTO `__new_agent_agent_sessions`("id", "owner_id", "issue_id", "thread_id", "provider", "cwd", "agent_session_id", "model", "last_message_id", "last_context_tokens", "last_turn_at", "created_at", "updated_at", "version") SELECT "id", "owner_id", "issue_id", "thread_id", "provider", "cwd", "agent_session_id", "model", "last_message_id", "last_context_tokens", "last_turn_at", "created_at", "updated_at", "version" FROM `agent_agent_sessions`;--> statement-breakpoint
DROP TABLE `agent_agent_sessions`;--> statement-breakpoint
ALTER TABLE `__new_agent_agent_sessions` RENAME TO `agent_agent_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_sessions_issue_unq` ON `agent_agent_sessions` (`issue_id`) WHERE issue_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_sessions_orchestrator_unq` ON `agent_agent_sessions` (`thread_id`) WHERE issue_id IS NULL;--> statement-breakpoint
CREATE INDEX `agent_sessions_last_turn_idx` ON `agent_agent_sessions` (`last_turn_at`);
