CREATE SCHEMA "activity";
--> statement-breakpoint
CREATE SCHEMA "authentication";
--> statement-breakpoint
CREATE SCHEMA "owner";
--> statement-breakpoint
CREATE SCHEMA "shared";
--> statement-breakpoint
CREATE TABLE "authentication"."accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity"."activity_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"first_occurred_at" timestamp with time zone NOT NULL,
	"last_occurred_at" timestamp with time zone NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"entity_id" text,
	"owner_id" text,
	"payload" jsonb NOT NULL,
	"source" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authentication"."fcm_registration_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared"."idempotency_keys" (
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"response_body" jsonb,
	"response_status" integer,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_key_scope_pk" PRIMARY KEY("key","scope")
);
--> statement-breakpoint
CREATE TABLE "shared"."outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"entity_id" text,
	"owner_id" text,
	"payload" jsonb NOT NULL,
	"source" text NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner"."owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"responsible_user_id" uuid NOT NULL,
	"picture_url" text,
	"timezone" text,
	"is_disabled" boolean DEFAULT false NOT NULL,
	"disabled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared"."scheduled_commands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"input" jsonb NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"lease_until" timestamp with time zone,
	"repeat_every_ms" integer,
	"dead_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authentication"."sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "authentication"."user_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"timezone" text,
	"language" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authentication"."users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "authentication"."verification_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authentication"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "authentication"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication"."fcm_registration_tokens" ADD CONSTRAINT "fcm_registration_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "authentication"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "authentication"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication"."user_profiles" ADD CONSTRAINT "user_profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "authentication"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_entries_owner_event_entity_unq" ON "activity"."activity_entries" USING btree ("owner_id","event_name","entity_id");--> statement-breakpoint
CREATE INDEX "activity_entries_owner_last_occurred_at_idx" ON "activity"."activity_entries" USING btree ("owner_id","last_occurred_at");--> statement-breakpoint
CREATE INDEX "events_entity_idx" ON "shared"."events" USING btree ("entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "events_name_idx" ON "shared"."events" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "events_billing_webhook_received_entity_unq" ON "shared"."events" USING btree ("entity_id") WHERE name = 'billing.webhook.received';--> statement-breakpoint
CREATE UNIQUE INDEX "fcm_registration_tokens_token_unq" ON "authentication"."fcm_registration_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "fcm_registration_tokens_user_id_idx" ON "authentication"."fcm_registration_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fcm_registration_tokens_last_seen_at_idx" ON "authentication"."fcm_registration_tokens" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "idempotency_expires_idx" ON "shared"."idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "outbox_unprocessed_idx" ON "shared"."outbox" USING btree ("source","processed_at","created_at");--> statement-breakpoint
CREATE INDEX "owners_is_disabled_idx" ON "owner"."owners" USING btree ("is_disabled");--> statement-breakpoint
CREATE INDEX "owners_responsible_user_id_idx" ON "owner"."owners" USING btree ("responsible_user_id");--> statement-breakpoint
CREATE INDEX "scheduled_commands_due_idx" ON "shared"."scheduled_commands" USING btree ("run_at") WHERE dead_at IS NULL;