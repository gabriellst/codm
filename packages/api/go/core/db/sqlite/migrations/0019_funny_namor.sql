PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_thread_transcript_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`issue_id` text,
	`quoted_entry_id` text,
	`sender_external_id` text,
	`fired_by_loop` text,
	`provider` text,
	`classification` text,
	`message_type` text,
	`media_path` text,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "thread_transcript_entries_kind_check" CHECK("__new_thread_transcript_entries"."kind" IN ('CONTACT', 'SYSTEM', 'DIRECT', 'WHISPER', 'ACTION')),
	CONSTRAINT "thread_transcript_entries_provider_check" CHECK("__new_thread_transcript_entries"."provider" IN ('CLAUDE_CODE', 'CODEX', 'OPENCODE')),
	CONSTRAINT "thread_transcript_entries_classification_check" CHECK("__new_thread_transcript_entries"."classification" IN ('REPLY_QUOTE', 'CONTEXT_MATCH', 'NEW_ISSUE', 'CLARIFIED')),
	CONSTRAINT "thread_transcript_entries_message_type_check" CHECK("__new_thread_transcript_entries"."message_type" IN ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'LOCATION', 'CONTACT', 'POLL', 'LIST', 'BUTTON', 'REACTION', 'STATUS'))
);
--> statement-breakpoint
INSERT INTO `__new_thread_transcript_entries`("id", "owner_id", "thread_id", "kind", "text", "issue_id", "quoted_entry_id", "sender_external_id", "fired_by_loop", "provider", "classification", "message_type", "media_path", "at", "created_at") SELECT "id", "owner_id", "thread_id", "kind", "text", "issue_id", "quoted_entry_id", "sender_external_id", "fired_by_loop", "provider", "classification", NULL, NULL, "at", "created_at" FROM `thread_transcript_entries`;--> statement-breakpoint
DROP TABLE `thread_transcript_entries`;--> statement-breakpoint
ALTER TABLE `__new_thread_transcript_entries` RENAME TO `thread_transcript_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transcript_entries_thread_at_idx` ON `thread_transcript_entries` (`thread_id`,`at`);--> statement-breakpoint
CREATE INDEX `transcript_entries_issue_id_idx` ON `thread_transcript_entries` (`issue_id`);