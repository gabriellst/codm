CREATE TABLE `agent_agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`provider` text NOT NULL,
	`cwd` text NOT NULL,
	`agent_session_id` text NOT NULL,
	`model` text DEFAULT 'DEFAULT' NOT NULL,
	`last_message_id` text,
	`last_turn_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "agent_agent_sessions_provider_check" CHECK("agent_agent_sessions"."provider" IN ('CLAUDE_CODE', 'CODEX', 'OPENCODE')),
	CONSTRAINT "agent_agent_sessions_model_check" CHECK("agent_agent_sessions"."model" IN ('DEFAULT', 'SONNET', 'OPUS', 'HAIKU'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_sessions_issue_unq` ON `agent_agent_sessions` (`issue_id`);--> statement-breakpoint
CREATE INDEX `agent_sessions_last_turn_idx` ON `agent_agent_sessions` (`last_turn_at`);--> statement-breakpoint
DROP TABLE `terminal_terminal_llm_sessions`;