CREATE TABLE `authentication_device_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `authentication_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `authentication_device_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`label` text NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `authentication_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authentication_device_tokens_token_hash_unique` ON `authentication_device_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `device_tokens_user_id_idx` ON `authentication_device_tokens` (`user_id`);