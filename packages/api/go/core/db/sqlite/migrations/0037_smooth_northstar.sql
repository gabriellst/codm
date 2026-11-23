CREATE TABLE `thread_batch_items` (
	`batch_id` text NOT NULL,
	`n` integer NOT NULL,
	`excerpt` text NOT NULL,
	`destination` text,
	`issue_id` text,
	`recorded_at` integer,
	PRIMARY KEY(`batch_id`, `n`)
);
--> statement-breakpoint
CREATE INDEX `thread_batch_items_issue_idx` ON `thread_batch_items` (`issue_id`);--> statement-breakpoint
CREATE TABLE `thread_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`code` text NOT NULL,
	`seq` integer NOT NULL,
	`source_entry_id` text NOT NULL,
	`item_count` integer NOT NULL,
	`status` text NOT NULL,
	`receipt_entry_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "thread_batches_status_check" CHECK("thread_batches"."status" IN ('INCOMPLETE', 'RECORDED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `thread_batches_thread_seq_unq` ON `thread_batches` (`thread_id`,`seq`);--> statement-breakpoint
CREATE TABLE `agent_issue_attributes` (
	`issue_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`priority` text NOT NULL,
	`priority_reason` text NOT NULL,
	`work_kind` text NOT NULL,
	`model` text,
	`worktree_path` text,
	`worktree_seen_at` integer,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "agent_issue_attributes_priority_check" CHECK("agent_issue_attributes"."priority" IN ('HIGH', 'NORMAL', 'LOW')),
	CONSTRAINT "agent_issue_attributes_priority_reason_check" CHECK("agent_issue_attributes"."priority_reason" IN ('CLIENT_BUG', 'DECLARED', 'DEFAULT')),
	CONSTRAINT "agent_issue_attributes_work_kind_check" CHECK("agent_issue_attributes"."work_kind" IN ('CHANGE', 'DIAGNOSIS')),
	CONSTRAINT "agent_issue_attributes_model_check" CHECK("agent_issue_attributes"."model" IN ('DEFAULT', 'SONNET', 'OPUS', 'HAIKU', 'TERRA', 'LUNA'))
);
--> statement-breakpoint
CREATE INDEX `agent_issue_attributes_thread_idx` ON `agent_issue_attributes` (`thread_id`);--> statement-breakpoint
ALTER TABLE `workspace_workspaces` ADD `publish_command` text;--> statement-breakpoint
ALTER TABLE `issue_issues` ADD `priority` text;--> statement-breakpoint
ALTER TABLE `issue_issues` ADD `priority_reason` text;--> statement-breakpoint
ALTER TABLE `issue_issues` ADD `work_kind` text;--> statement-breakpoint
ALTER TABLE `issue_issues` ADD `model` text;--> statement-breakpoint
ALTER TABLE `issue_terminal_lines` ADD `timeline_item_id` text;--> statement-breakpoint
CREATE INDEX `terminal_lines_timeline_item_idx` ON `issue_terminal_lines` (`issue_id`,`timeline_item_id`);--> statement-breakpoint
ALTER TABLE `agent_mailbox` ADD `claim_class` text DEFAULT 'WORK' NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_agent_sessions` ADD `handoff_notes` text;--> statement-breakpoint
ALTER TABLE `agent_agent_sessions` ADD `handoff_at` integer;
--> statement-breakpoint
-- Hand-written (fase 4, S0a): drizzle-kit emits schema, never data. The class of every EXISTING queue item,
-- derived from its kind by the declared table CLAIM_CLASS_OF_KIND (agent/utils/ClaimClassOfKind.ts) — the
-- constant DEFAULT 'WORK' above exists only because SQLite's ADD COLUMN NOT NULL demands a constant.
-- Pinned by tests/kernel/fase4-0037.migration.test.ts with the real LibSqlDriver.
UPDATE `agent_mailbox` SET `claim_class` = CASE `kind` WHEN 'WORK' THEN 'WORK' WHEN 'STEER' THEN 'STEER' WHEN 'ISSUE_RESULT' THEN 'RESULT' WHEN 'OPERATOR_MESSAGE' THEN 'OPERATOR' ELSE `claim_class` END;--> statement-breakpoint
-- Hand-written: one attributes row per existing issue, with the defaults (NORMAL / DEFAULT / CHANGE; model
-- null = inherits the conversation's), so the claim order, the batch validation and the worktree janitor
-- treat older tasks like new ones. closed_at = completed_at of the completed ones; nothing old has a
-- worktree_path, so no old worktree is ever removed.
INSERT INTO `agent_issue_attributes` (`issue_id`, `owner_id`, `thread_id`, `priority`, `priority_reason`, `work_kind`, `model`, `closed_at`, `created_at`) SELECT `id`, `owner_id`, `thread_id`, 'NORMAL', 'DEFAULT', 'CHANGE', NULL, CASE WHEN `status` = 'COMPLETED' THEN `completed_at` END, `created_at` FROM `issue_issues`;
