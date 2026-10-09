-- HAND-ADDED (participant-permission-posture spec, Decision 2 / AC-2): every roster participant gains
-- `canElevate` — the `operator` sentinel true, everyone else false. The VO parses `z.boolean()` with no
-- default, so a roster without the key would refuse to rehydrate. A participant that already carries
-- the key is left alone, which is also what makes a second pass a no-op (idempotent under the shared
-- `_sqlite_migrations` ledger, whichever runtime boots first). Pinned by
-- `packages/contracts/src/db/participants-can-elevate.backfill.test.ts`.
UPDATE `thread_threads` SET `participants` = (SELECT json_group_array(CASE WHEN json_type(value, '$.canElevate') IS NOT NULL THEN json(value) ELSE json_set(value, '$.canElevate', json(CASE WHEN json_extract(value, '$.participantId') = 'operator' THEN 'true' ELSE 'false' END)) END) FROM json_each(`thread_threads`.`participants`)) WHERE EXISTS (SELECT 1 FROM json_each(`thread_threads`.`participants`) WHERE json_type(value, '$.canElevate') IS NULL);--> statement-breakpoint
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
	CONSTRAINT "issue_stops_kind_check" CHECK("__new_issue_stops"."kind" IN ('SERVER_ERROR', 'BLOCKED_BY_CLASSIFICATION', 'HUMAN_REQUESTED', 'APPROVAL_NEEDED', 'AUTH_REQUIRED', 'PERMISSION_DENIED')),
	CONSTRAINT "issue_stops_resolution_check" CHECK("__new_issue_stops"."resolution" IN ('RETRY', 'REVIEW_AND_SEND', 'TAKE_OVER', 'APPROVE', 'DENY'))
);
--> statement-breakpoint
INSERT INTO `__new_issue_stops`("id", "owner_id", "issue_id", "thread_id", "kind", "title", "detail", "raised_at", "resolution", "resolved_at") SELECT "id", "owner_id", "issue_id", "thread_id", "kind", "title", "detail", "raised_at", "resolution", "resolved_at" FROM `issue_stops`;--> statement-breakpoint
DROP TABLE `issue_stops`;--> statement-breakpoint
ALTER TABLE `__new_issue_stops` RENAME TO `issue_stops`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `stops_issue_id_idx` ON `issue_stops` (`issue_id`);--> statement-breakpoint
CREATE INDEX `stops_thread_id_idx` ON `issue_stops` (`thread_id`);--> statement-breakpoint
ALTER TABLE `issue_stop_policy_config` ADD `permission_denied` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_agent_mailbox` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`kind` text NOT NULL,
	`posture` text DEFAULT 'AUTO' NOT NULL,
	`payload` text NOT NULL,
	`dedup_key` text NOT NULL,
	`claimed_by` text,
	`claimed_boot` text,
	`claimed_pid` integer,
	`lease_until` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`dead_at` integer,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "agent_mailbox_target_kind_check" CHECK("__new_agent_mailbox"."target_kind" IN ('THREAD', 'ISSUE')),
	CONSTRAINT "agent_mailbox_kind_check" CHECK("__new_agent_mailbox"."kind" IN ('OPERATOR_MESSAGE', 'ISSUE_RESULT', 'WORK', 'STEER')),
	CONSTRAINT "agent_mailbox_posture_check" CHECK("__new_agent_mailbox"."posture" IN ('AUTO', 'BYPASS'))
);
--> statement-breakpoint
INSERT INTO `__new_agent_mailbox`("id", "owner_id", "target_kind", "target_id", "kind", "payload", "dedup_key", "claimed_by", "claimed_boot", "claimed_pid", "lease_until", "attempts", "last_error", "dead_at", "consumed_at", "created_at") SELECT "id", "owner_id", "target_kind", "target_id", "kind", "payload", "dedup_key", "claimed_by", "claimed_boot", "claimed_pid", "lease_until", "attempts", "last_error", "dead_at", "consumed_at", "created_at" FROM `agent_mailbox`;--> statement-breakpoint
DROP TABLE `agent_mailbox`;--> statement-breakpoint
ALTER TABLE `__new_agent_mailbox` RENAME TO `agent_mailbox`;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_mailbox_dedup_unq` ON `agent_mailbox` (`dedup_key`);--> statement-breakpoint
CREATE INDEX `agent_mailbox_pending_idx` ON `agent_mailbox` (`target_kind`,`target_id`,`consumed_at`,`created_at`) WHERE dead_at IS NULL;