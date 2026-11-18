CREATE TABLE `thread_panel_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`kind` text NOT NULL,
	`outcome` text NOT NULL,
	`outcome_code` text,
	`executed_at` integer NOT NULL,
	`reported_at` integer,
	CONSTRAINT "thread_panel_actions_kind_check" CHECK("thread_panel_actions"."kind" IN ('PAUSE', 'RESUME', 'STEER', 'ANSWER_STOP')),
	CONSTRAINT "thread_panel_actions_outcome_check" CHECK("thread_panel_actions"."outcome" IN ('DONE', 'REFUSED'))
);
--> statement-breakpoint
CREATE INDEX `panel_actions_reported_idx` ON `thread_panel_actions` (`reported_at`);