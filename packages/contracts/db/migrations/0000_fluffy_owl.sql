CREATE SCHEMA "authentication";
--> statement-breakpoint
CREATE SCHEMA "billing";
--> statement-breakpoint
CREATE SCHEMA "notifications";
--> statement-breakpoint
CREATE SCHEMA "owner";
--> statement-breakpoint
CREATE SCHEMA "quota";
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
CREATE TABLE "billing"."billing_profiles" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"document" text NOT NULL,
	"language" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_charges" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"platform" text NOT NULL,
	"method" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"attempt_no" integer NOT NULL,
	"status" text NOT NULL,
	"gateway_tx_id" text,
	"decline_code" text
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_checkout_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"session_ref" text NOT NULL,
	"platform" text NOT NULL,
	"intent" text NOT NULL,
	"engine_invoice_id" text,
	"status" text NOT NULL,
	"minted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_credit_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"number" text NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"gateway_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "billing_credit_notes_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"gateway_dispute_ref" text NOT NULL,
	"platform" text NOT NULL,
	"owner_id" text NOT NULL,
	"gateway_tx_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shared"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"entity_id" uuid,
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
CREATE TABLE "billing"."billing_invoices" (
	"invoice_id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"number" text,
	"pdf_url" text,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"description" text,
	"due_date" timestamp with time zone,
	"our_number" text NOT NULL,
	"plan_name" text,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_invoices_our_number_unique" UNIQUE("our_number")
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_invoice_sequences" (
	"prefix" text PRIMARY KEY NOT NULL,
	"next_number" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications"."notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"delivered_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category" text NOT NULL,
	"origin" text NOT NULL,
	"important" boolean DEFAULT false NOT NULL,
	"content_type" text DEFAULT 'text/plain' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared"."outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"entity_id" uuid,
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
CREATE TABLE "billing"."billing_payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"platform" text NOT NULL,
	"type" text NOT NULL,
	"pm_ref" text NOT NULL,
	"supports_off_session" boolean NOT NULL,
	"capture_origin" text,
	"origin_gateway_tx_id" text,
	"brand" text,
	"last4" text,
	"exp_month" integer,
	"exp_year" integer,
	"network" text,
	"mandate_accepted_at" timestamp with time zone NOT NULL,
	"mandate_ip" text,
	"mandate_user_agent" text,
	"mandate_consent_version" text,
	"status" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quota"."pending_selections" (
	"owner_id" text NOT NULL,
	"quota_key" text NOT NULL,
	"kept_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_selections_owner_id_quota_key_pk" PRIMARY KEY("owner_id","quota_key")
);
--> statement-breakpoint
CREATE TABLE "quota"."quota_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"meter" text NOT NULL,
	"delta" integer NOT NULL,
	"idem_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quota_overrides_idem_key_unique" UNIQUE("idem_key")
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
CREATE TABLE "billing"."billing_subscriptions" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"engine_subscription_id" text NOT NULL,
	"plan_name" text NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"scheduled_plan_name" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_usage_rollups" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"meter" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authentication"."user_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"timezone" text,
	"language" text,
	"lead_token" text,
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
	"phone" text,
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
ALTER TABLE "billing"."billing_credit_notes" ADD CONSTRAINT "billing_credit_notes_invoice_id_billing_invoices_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "billing"."billing_invoices"("invoice_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication"."fcm_registration_tokens" ADD CONSTRAINT "fcm_registration_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "authentication"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "notifications"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "authentication"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication"."user_profiles" ADD CONSTRAINT "user_profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "authentication"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkout_sessions_session_ref_idx" ON "billing"."billing_checkout_sessions" USING btree ("session_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_disputes_ref_platform_idx" ON "billing"."billing_disputes" USING btree ("gateway_dispute_ref","platform");--> statement-breakpoint
CREATE INDEX "billing_disputes_invoice_id_idx" ON "billing"."billing_disputes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "events_entity_idx" ON "shared"."events" USING btree ("entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "events_name_idx" ON "shared"."events" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "events_billing_webhook_received_entity_unq" ON "shared"."events" USING btree ("entity_id") WHERE name = 'billing.webhook.received';--> statement-breakpoint
CREATE UNIQUE INDEX "fcm_registration_tokens_token_unq" ON "authentication"."fcm_registration_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "fcm_registration_tokens_user_id_idx" ON "authentication"."fcm_registration_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fcm_registration_tokens_last_seen_at_idx" ON "authentication"."fcm_registration_tokens" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "idempotency_expires_idx" ON "shared"."idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_notification_user_channel_unq" ON "notifications"."notification_deliveries" USING btree ("notification_id","user_id","channel");--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_read_at_idx" ON "notifications"."notification_deliveries" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_notification_id_idx" ON "notifications"."notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notifications_owner_id_idx" ON "notifications"."notifications" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications"."notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_category_idx" ON "notifications"."notifications" USING btree ("category");--> statement-breakpoint
CREATE INDEX "notifications_origin_idx" ON "notifications"."notifications" USING btree ("origin");--> statement-breakpoint
CREATE INDEX "outbox_unprocessed_idx" ON "shared"."outbox" USING btree ("source","processed_at","created_at");--> statement-breakpoint
CREATE INDEX "owners_is_disabled_idx" ON "owner"."owners" USING btree ("is_disabled");--> statement-breakpoint
CREATE INDEX "owners_responsible_user_id_idx" ON "owner"."owners" USING btree ("responsible_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_payment_methods_default_owner_idx" ON "billing"."billing_payment_methods" USING btree ("owner_id") WHERE "billing"."billing_payment_methods"."is_default" AND "billing"."billing_payment_methods"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "scheduled_commands_due_idx" ON "shared"."scheduled_commands" USING btree ("run_at") WHERE dead_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_usage_rollups_owner_meter_period_uq" ON "billing"."billing_usage_rollups" USING btree ("owner_id","meter","period_start");--> statement-breakpoint
CREATE INDEX "user_profiles_lead_token_idx" ON "authentication"."user_profiles" USING btree ("lead_token");