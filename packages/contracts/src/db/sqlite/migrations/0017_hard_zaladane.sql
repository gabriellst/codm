CREATE TABLE `owner_onboardings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`current_step` text NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "owner_onboardings_current_step_check" CHECK("owner_onboardings"."current_step" IN ('VALUE', 'HOW', 'CONTROL', 'CHANNEL', 'WORKSPACE', 'CONTACT', 'AGENTS', 'REVIEW', 'FINAL'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboardings_owner_id_idx` ON `owner_onboardings` (`owner_id`);