PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	CONSTRAINT "issue_stops_resolution_check" CHECK("__new_issue_stops"."resolution" IN ('RETRY', 'REVIEW_AND_SEND', 'TAKE_OVER', 'APPROVE', 'DENY', 'ANSWER', 'DEFAULT_APPLIED', 'AUTO_RETRY'))
);
--> statement-breakpoint
-- HAND-REVIEWED (fase 5): the rebuild is forced by `issue_stops_resolution_check` growing AUTO_RETRY
-- (SQLite cannot alter a CHECK). Unlike 0036, all sixteen columns copied below already exist in the old
-- table (0036 added ask … ask_entry_id; checked against meta/0037_snapshot.json), so the generated copy is
-- kept verbatim: every row and every value survives, both CHECKs are recreated, and the four indexes
-- (stops_issue_id_idx, stops_thread_id_idx, the unique stops_issue_seq_unq, stops_due_at_idx) are rebuilt
-- right after the rename. Pinned by `packages/api/typescript/tests/kernel/fase5-0038.migration.test.ts`.
INSERT INTO `__new_issue_stops`("id", "owner_id", "issue_id", "thread_id", "kind", "title", "detail", "raised_at", "resolution", "resolved_at", "ask", "answer", "answered_by", "seq", "due_at", "ask_entry_id") SELECT "id", "owner_id", "issue_id", "thread_id", "kind", "title", "detail", "raised_at", "resolution", "resolved_at", "ask", "answer", "answered_by", "seq", "due_at", "ask_entry_id" FROM `issue_stops`;--> statement-breakpoint
DROP TABLE `issue_stops`;--> statement-breakpoint
ALTER TABLE `__new_issue_stops` RENAME TO `issue_stops`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `stops_issue_id_idx` ON `issue_stops` (`issue_id`);--> statement-breakpoint
CREATE INDEX `stops_thread_id_idx` ON `issue_stops` (`thread_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `stops_issue_seq_unq` ON `issue_stops` (`issue_id`,`seq`);--> statement-breakpoint
CREATE INDEX `stops_due_at_idx` ON `issue_stops` (`due_at`);--> statement-breakpoint
ALTER TABLE `agent_mailbox` ADD `defer_cause` text;--> statement-breakpoint
ALTER TABLE `agent_agent_sessions` ADD `handoff_requested_at` integer;--> statement-breakpoint
-- HAND-WRITTEN (fase 5, item 2): the cause of every item deferred at upgrade time, decided ONCE here by the
-- rule the readers apply today by join (providerWaitByIssue, lifeStateOf): a deferral is a runnable row
-- (not consumed, not dead) with no holder and a lease in the future. An ISSUE item whose issue or
-- conversation is paused is the pause (`holdItem` only ever holds ISSUE items) → HOLD; every other
-- deferral is the provider's usage limit (`waitForProvider`) → PROVIDER_LIMIT. Rows not deferred keep NULL
-- (null ⇔ not deferred). lease_until is epoch ms.
UPDATE `agent_mailbox` SET `defer_cause` = CASE
	WHEN `target_kind` = 'ISSUE' AND EXISTS (
		SELECT 1 FROM `issue_issues` i LEFT JOIN `thread_threads` t ON t.`id` = i.`thread_id`
		WHERE i.`id` = `agent_mailbox`.`target_id` AND (i.`paused` = 1 OR t.`paused` = 1)
	) THEN 'HOLD'
	ELSE 'PROVIDER_LIMIT'
END
WHERE `consumed_at` IS NULL AND `dead_at` IS NULL AND `claimed_by` IS NULL
	AND `lease_until` IS NOT NULL AND `lease_until` > CAST(strftime('%s', 'now') AS INTEGER) * 1000;--> statement-breakpoint
-- HAND-WRITTEN (fase 5, item 1): the declaration reminders written before this release are recognised by
-- their payload flag, and 0037 classified them by kind (STEER) — the installed 0.9.0 runs 0037 and 0038 in
-- the same boot, so the filter is the payload, not the class. Each becomes what a reminder is from now on:
-- claim_class REMINDER and the first nudge of its episode, with the old flag removed.
UPDATE `agent_mailbox` SET
	`claim_class` = 'REMINDER',
	`payload` = json_set(json_remove(`payload`, '$.declarationReminder'), '$.nudge', json_object('ordinal', 1, 'source', 'RECONCILER'))
WHERE json_extract(`payload`, '$.declarationReminder') = 1;
