-- NOTE: `platform` and `name` are added as NOT NULL with no default. This is safe only because
-- the `gateway.channels` table is empty on the single-operator daemon (fresh-table assumption,
-- per .plans/2026-07-23-channel-rich-model-sqlc.md). On a populated table this would fail; a
-- backfill + default would be required first.
DROP INDEX "gateway"."channels_owner_kind_idx";--> statement-breakpoint
ALTER TABLE "gateway"."channels" ALTER COLUMN "owner_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "gateway"."channels" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "gateway"."channels" ADD COLUMN "platform" text NOT NULL;--> statement-breakpoint
ALTER TABLE "gateway"."channels" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "gateway"."channels" ADD COLUMN "owner_remote_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gateway"."channels" ADD COLUMN "credentials" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "gateway"."channels" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_channels_owner_id" ON "gateway"."channels" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_channels_owner_platform" ON "gateway"."channels" USING btree ("owner_id","platform");--> statement-breakpoint
ALTER TABLE "gateway"."channels" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "gateway"."channels" DROP COLUMN "account_detail";