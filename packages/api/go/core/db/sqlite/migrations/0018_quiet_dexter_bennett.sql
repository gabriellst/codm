PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_gateway_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`remote_id` text NOT NULL,
	`platform_message_id` text NOT NULL,
	`direction` text NOT NULL,
	`platform` text NOT NULL,
	`sender_remote_id` text NOT NULL,
	`message_type` text,
	`content` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`observed_at` integer NOT NULL,
	`delivered_at` integer,
	`seen_at` integer,
	`edited_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "gateway_messages_direction_check" CHECK("__new_gateway_messages"."direction" IN ('SENT', 'RECEIVED')),
	CONSTRAINT "gateway_messages_platform_check" CHECK("__new_gateway_messages"."platform" IN ('WHATSAPP', 'INTERNAL')),
	CONSTRAINT "gateway_messages_message_type_check" CHECK("__new_gateway_messages"."message_type" IN ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'LOCATION', 'CONTACT', 'POLL', 'LIST', 'BUTTON', 'REACTION', 'STATUS'))
);
--> statement-breakpoint
INSERT INTO `__new_gateway_messages`("id", "channel_id", "remote_id", "platform_message_id", "direction", "platform", "sender_remote_id", "message_type", "content", "occurred_at", "observed_at", "delivered_at", "seen_at", "edited_at", "deleted_at", "version") SELECT "id", "channel_id", "remote_id", "platform_message_id", "direction", "platform", "sender_remote_id", NULL, "content", "occurred_at", "observed_at", "delivered_at", "seen_at", "edited_at", "deleted_at", "version" FROM `gateway_messages`;--> statement-breakpoint
DROP TABLE `gateway_messages`;--> statement-breakpoint
ALTER TABLE `__new_gateway_messages` RENAME TO `gateway_messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_messages_channel_platform` ON `gateway_messages` (`channel_id`,`platform_message_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_remote` ON `gateway_messages` (`channel_id`,`remote_id`,"occurred_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_messages_channel` ON `gateway_messages` (`channel_id`,"occurred_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_messages_channel_remote_occurred` ON `gateway_messages` (`channel_id`,`remote_id`,"occurred_at" DESC) WHERE "gateway_messages"."deleted_at" IS NULL;