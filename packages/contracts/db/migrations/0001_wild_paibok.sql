DROP INDEX "authentication"."user_profiles_lead_token_idx";--> statement-breakpoint
ALTER TABLE "authentication"."user_profiles" DROP COLUMN "lead_token";