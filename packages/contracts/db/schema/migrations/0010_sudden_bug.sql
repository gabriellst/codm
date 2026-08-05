CREATE TABLE `thread_loops` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`prompt` text NOT NULL,
	`time_of_day` text NOT NULL,
	`weekdays` text NOT NULL,
	`timezone` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`next_run_at` integer,
	`last_fired_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `loops_thread_id_idx` ON `thread_loops` (`thread_id`);--> statement-breakpoint
CREATE INDEX `loops_next_run_at_idx` ON `thread_loops` (`next_run_at`);