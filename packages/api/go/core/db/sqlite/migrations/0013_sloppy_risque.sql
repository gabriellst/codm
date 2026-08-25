PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_artifact_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`issue_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`ref` text NOT NULL,
	`meta` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "artifact_artifacts_kind_check" CHECK("__new_artifact_artifacts"."kind" IN ('IMAGE', 'AUDIO', 'VIDEO', 'FILE', 'LINK'))
);
--> statement-breakpoint
INSERT INTO `__new_artifact_artifacts`("id", "owner_id", "thread_id", "issue_id", "kind", "name", "ref", "meta", "recorded_at", "created_at") SELECT "id", "owner_id", "thread_id", "issue_id", "kind", "name", "ref", "meta", "recorded_at", "created_at" FROM `artifact_artifacts`;--> statement-breakpoint
DROP TABLE `artifact_artifacts`;--> statement-breakpoint
ALTER TABLE `__new_artifact_artifacts` RENAME TO `artifact_artifacts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `artifacts_thread_id_idx` ON `artifact_artifacts` (`thread_id`);--> statement-breakpoint
CREATE INDEX `artifacts_issue_id_idx` ON `artifact_artifacts` (`issue_id`);