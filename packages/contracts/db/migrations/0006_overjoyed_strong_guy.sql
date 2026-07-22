CREATE TABLE "gateway"."messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"channel_id" uuid NOT NULL,
	"remote_id" text NOT NULL,
	"platform_message_id" text NOT NULL,
	"direction" text NOT NULL,
	"platform" text NOT NULL,
	"sender_remote_id" text NOT NULL,
	"content" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"seen_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateway"."remote_memberships" (
	"channel_id" uuid NOT NULL,
	"group_id" text NOT NULL,
	"member_id" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	CONSTRAINT "remote_memberships_channel_id_group_id_member_id_pk" PRIMARY KEY("channel_id","group_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "gateway"."remotes" (
	"channel_id" uuid NOT NULL,
	"remote_id" text NOT NULL,
	"type" text NOT NULL,
	"platform" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"avatar_url" text,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"pinned_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"mute_expiration" timestamp with time zone,
	"marked_as_unread" boolean DEFAULT false NOT NULL,
	"unread_message_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"last_message_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "remotes_channel_id_remote_id_pk" PRIMARY KEY("channel_id","remote_id")
);
--> statement-breakpoint
ALTER TABLE "gateway"."remote_memberships" ADD CONSTRAINT "remote_memberships_channel_id_group_id_remotes_channel_id_remote_id_fk" FOREIGN KEY ("channel_id","group_id") REFERENCES "gateway"."remotes"("channel_id","remote_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_messages_channel_platform" ON "gateway"."messages" USING btree ("channel_id","platform_message_id");--> statement-breakpoint
CREATE INDEX "idx_messages_remote" ON "gateway"."messages" USING btree ("channel_id","remote_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_messages_channel" ON "gateway"."messages" USING btree ("channel_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_messages_channel_remote_occurred" ON "gateway"."messages" USING btree ("channel_id","remote_id","occurred_at" DESC NULLS LAST) WHERE "gateway"."messages"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_remotes_last_message_at" ON "gateway"."remotes" USING btree ("channel_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_remotes_type" ON "gateway"."remotes" USING btree ("channel_id","type");--> statement-breakpoint
CREATE INDEX "idx_remotes_pinned" ON "gateway"."remotes" USING btree ("channel_id","pinned_at" DESC NULLS LAST) WHERE "gateway"."remotes"."pinned_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_remotes_avatar_missing" ON "gateway"."remotes" USING btree ("channel_id","remote_id") WHERE "gateway"."remotes"."avatar_url" IS NULL AND "gateway"."remotes"."deleted_at" IS NULL;