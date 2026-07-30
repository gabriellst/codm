ALTER TABLE `shared_outbox` ADD `claimed_by` text;--> statement-breakpoint
ALTER TABLE `shared_outbox` ADD `lease_until` integer;--> statement-breakpoint
CREATE INDEX `outbox_claim_idx` ON `shared_outbox` (`source`,`processed_at`,`lease_until`);