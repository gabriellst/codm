CREATE TABLE "thread"."consumed_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"platform_message_id" text NOT NULL,
	"thread_id" uuid,
	"entry_id" uuid,
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "consumed_messages_channel_message_unq" ON "thread"."consumed_messages" USING btree ("channel_id","platform_message_id");