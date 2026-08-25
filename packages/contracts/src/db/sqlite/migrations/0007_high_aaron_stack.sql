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
	CONSTRAINT "issue_stops_kind_check" CHECK("__new_issue_stops"."kind" IN ('SERVER_ERROR', 'BLOCKED_BY_CLASSIFICATION', 'HUMAN_REQUESTED', 'APPROVAL_NEEDED', 'AUTH_REQUIRED')),
	CONSTRAINT "issue_stops_resolution_check" CHECK("__new_issue_stops"."resolution" IN ('RETRY', 'REVIEW_AND_SEND', 'TAKE_OVER', 'APPROVE', 'DENY'))
);
--> statement-breakpoint
INSERT INTO `__new_issue_stops`("id", "owner_id", "issue_id", "thread_id", "kind", "title", "detail", "raised_at", "resolution", "resolved_at") SELECT "id", "owner_id", "issue_id", "thread_id", "kind", "title", "detail", "raised_at", "resolution", "resolved_at" FROM `issue_stops`;--> statement-breakpoint
DROP TABLE `issue_stops`;--> statement-breakpoint
ALTER TABLE `__new_issue_stops` RENAME TO `issue_stops`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `stops_issue_id_idx` ON `issue_stops` (`issue_id`);--> statement-breakpoint
CREATE INDEX `stops_thread_id_idx` ON `issue_stops` (`thread_id`);