CREATE TABLE "authentication_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authentication_device_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authentication_device_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "authentication_device_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "authentication_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_owner_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "authentication_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "authentication_user_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"timezone" text,
	"language" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authentication_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "authentication_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "authentication_verification_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_onboardings" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"current_step" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "owner_onboardings_current_step_check" CHECK ("owner_onboardings"."current_step" IN ('VALUE', 'HOW', 'CONTROL', 'CHANNEL', 'WORKSPACE', 'CONTACT', 'AGENTS', 'REVIEW', 'FINAL'))
);
--> statement-breakpoint
CREATE TABLE "owner_owners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"responsible_user_id" text NOT NULL,
	"picture_url" text,
	"timezone" text,
	"is_disabled" boolean DEFAULT false NOT NULL,
	"disabled_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "owner_owners_kind_check" CHECK ("owner_owners"."kind" IN ('ORGANIZATION', 'INDIVIDUAL'))
);
--> statement-breakpoint
CREATE TABLE "shared_events" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"entity_id" text,
	"owner_id" text,
	"payload" jsonb NOT NULL,
	"source" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_idempotency_keys" (
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"response_body" jsonb,
	"response_status" integer,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "shared_idempotency_keys_key_scope_pk" PRIMARY KEY("key","scope")
);
--> statement-breakpoint
CREATE TABLE "shared_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"entity_id" text,
	"owner_id" text,
	"payload" jsonb NOT NULL,
	"source" text NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"claimed_by" text,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_scheduled_commands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"input" jsonb NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"lease_until" timestamp with time zone,
	"repeat_every_ms" integer,
	"dead_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authentication_accounts" ADD CONSTRAINT "authentication_accounts_user_id_authentication_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."authentication_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_device_codes" ADD CONSTRAINT "authentication_device_codes_user_id_authentication_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."authentication_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_device_tokens" ADD CONSTRAINT "authentication_device_tokens_user_id_authentication_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."authentication_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_sessions" ADD CONSTRAINT "authentication_sessions_user_id_authentication_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."authentication_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_user_profiles" ADD CONSTRAINT "authentication_user_profiles_id_authentication_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."authentication_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_tokens_user_id_idx" ON "authentication_device_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboardings_owner_id_idx" ON "owner_onboardings" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "owners_is_disabled_idx" ON "owner_owners" USING btree ("is_disabled");--> statement-breakpoint
CREATE INDEX "owners_responsible_user_id_idx" ON "owner_owners" USING btree ("responsible_user_id");--> statement-breakpoint
CREATE INDEX "events_entity_idx" ON "shared_events" USING btree ("entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "events_name_idx" ON "shared_events" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "events_billing_webhook_received_entity_unq" ON "shared_events" USING btree ("entity_id") WHERE name = 'billing.webhook.received';--> statement-breakpoint
CREATE INDEX "idempotency_expires_idx" ON "shared_idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "outbox_unprocessed_idx" ON "shared_outbox" USING btree ("source","processed_at","created_at");--> statement-breakpoint
CREATE INDEX "outbox_claim_idx" ON "shared_outbox" USING btree ("source","processed_at","lease_until");--> statement-breakpoint
CREATE INDEX "scheduled_commands_due_idx" ON "shared_scheduled_commands" USING btree ("run_at") WHERE dead_at IS NULL;