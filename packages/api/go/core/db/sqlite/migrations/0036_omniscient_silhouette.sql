PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_thread_panel_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`kind` text NOT NULL,
	`outcome` text NOT NULL,
	`outcome_code` text,
	`executed_at` integer NOT NULL,
	`reported_at` integer,
	CONSTRAINT "thread_panel_actions_kind_check" CHECK("__new_thread_panel_actions"."kind" IN ('PAUSE', 'RESUME', 'STEER', 'ANSWER_STOP', 'ANSWER_ASK')),
	CONSTRAINT "thread_panel_actions_outcome_check" CHECK("__new_thread_panel_actions"."outcome" IN ('DONE', 'REFUSED'))
);
--> statement-breakpoint
INSERT INTO `__new_thread_panel_actions`("id", "owner_id", "thread_id", "kind", "outcome", "outcome_code", "executed_at", "reported_at") SELECT "id", "owner_id", "thread_id", "kind", "outcome", "outcome_code", "executed_at", "reported_at" FROM `thread_panel_actions`;--> statement-breakpoint
DROP TABLE `thread_panel_actions`;--> statement-breakpoint
ALTER TABLE `__new_thread_panel_actions` RENAME TO `thread_panel_actions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `panel_actions_reported_idx` ON `thread_panel_actions` (`reported_at`);--> statement-breakpoint
CREATE TABLE `__new_issue_stops` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`issue_id` text,
	`thread_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`raised_at` integer NOT NULL,
	`resolution` text,
	`resolved_at` integer,
	`ask` text,
	`answer` text,
	`answered_by` text,
	`seq` integer,
	`due_at` integer,
	`ask_entry_id` text,
	CONSTRAINT "issue_stops_kind_check" CHECK("__new_issue_stops"."kind" IN ('SERVER_ERROR', 'BLOCKED_BY_CLASSIFICATION', 'HUMAN_REQUESTED', 'APPROVAL_NEEDED', 'AUTH_REQUIRED', 'PERMISSION_DENIED', 'DECISION_REQUESTED', 'QUESTION_ASKED', 'STALLED')),
	CONSTRAINT "issue_stops_resolution_check" CHECK("__new_issue_stops"."resolution" IN ('RETRY', 'REVIEW_AND_SEND', 'TAKE_OVER', 'APPROVE', 'DENY', 'ANSWER', 'DEFAULT_APPLIED'))
);
--> statement-breakpoint
-- HAND-EDITED (fase 3): drizzle-kit copied the six NEW columns (ask … ask_entry_id) out of the OLD table,
-- which does not have them — the rebuild would fail on every existing install. Only the ten columns the
-- old table has are copied; the new ones start NULL (no existing stop is an ask). Kind and resolution are
-- copied verbatim: the reconciler's old HUMAN_REQUESTED stops stay HUMAN_REQUESTED (history is not
-- rewritten). Pinned by `packages/contracts/src/db/issue-stops-ask.rebuild.test.ts`.
INSERT INTO `__new_issue_stops`("id", "owner_id", "issue_id", "thread_id", "kind", "title", "detail", "raised_at", "resolution", "resolved_at") SELECT "id", "owner_id", "issue_id", "thread_id", "kind", "title", "detail", "raised_at", "resolution", "resolved_at" FROM `issue_stops`;--> statement-breakpoint
DROP TABLE `issue_stops`;--> statement-breakpoint
ALTER TABLE `__new_issue_stops` RENAME TO `issue_stops`;--> statement-breakpoint
CREATE INDEX `stops_issue_id_idx` ON `issue_stops` (`issue_id`);--> statement-breakpoint
CREATE INDEX `stops_thread_id_idx` ON `issue_stops` (`thread_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `stops_issue_seq_unq` ON `issue_stops` (`issue_id`,`seq`);--> statement-breakpoint
CREATE INDEX `stops_due_at_idx` ON `issue_stops` (`due_at`);--> statement-breakpoint
ALTER TABLE `thread_threads` ADD `output_mode` text DEFAULT 'DECISIONS_AND_LIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE `thread_transcript_entries` ADD `level` text;--> statement-breakpoint
ALTER TABLE `thread_transcript_entries` ADD `routing` text;--> statement-breakpoint
ALTER TABLE `thread_transcript_entries` ADD `stop_id` text;--> statement-breakpoint
ALTER TABLE `thread_transcript_entries` ADD `digest_entry_id` text;--> statement-breakpoint
ALTER TABLE `thread_transcript_entries` ADD `addressee_id` text;--> statement-breakpoint
CREATE INDEX `transcript_entries_digest_idx` ON `thread_transcript_entries` (`thread_id`,`routing`,`digest_entry_id`);