PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_thread_loops` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`prompt` text NOT NULL,
	`kind` text DEFAULT 'DAILY' NOT NULL,
	`time_of_day` text,
	`weekdays` text,
	`timezone` text,
	`every_minutes` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`next_run_at` integer,
	`last_fired_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "thread_loops_kind_check" CHECK("__new_thread_loops"."kind" IN ('DAILY', 'INTERVAL'))
);
--> statement-breakpoint
--> BACKFILL, hand-written: drizzle-kit's generated SELECT listed `kind` and `every_minutes` as if the
--> OLD table had them. It does not — they are born in this migration — so the generated statement
--> raised `no such column: kind` against any database that already held loops. Every existing row is
--> by definition a wall-clock schedule, so `kind` is the literal 'DAILY' and `every_minutes` is NULL.
INSERT INTO `__new_thread_loops`("id", "owner_id", "thread_id", "prompt", "kind", "time_of_day", "weekdays", "timezone", "every_minutes", "enabled", "next_run_at", "last_fired_at", "created_at", "updated_at", "version") SELECT "id", "owner_id", "thread_id", "prompt", 'DAILY', "time_of_day", "weekdays", "timezone", NULL, "enabled", "next_run_at", "last_fired_at", "created_at", "updated_at", "version" FROM `thread_loops`;--> statement-breakpoint
DROP TABLE `thread_loops`;--> statement-breakpoint
ALTER TABLE `__new_thread_loops` RENAME TO `thread_loops`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `loops_thread_id_idx` ON `thread_loops` (`thread_id`);--> statement-breakpoint
CREATE INDEX `loops_next_run_at_idx` ON `thread_loops` (`next_run_at`);