-- Clean-slate cleanup for event sourcing.
-- Drops all satellite tables replaced by event sourcing.
-- shared.events stays intact — message history is preserved.
-- whatsmeow tables stay untouched (they're in their own schema).
--
-- After this migration, the Channel aggregate is projected from shared.events
-- via EventSourcedChannelRepository (see Task 8). Users re-authenticate after
-- deploy to emit fresh channel.channel_created / channel.channel_connected
-- events — there is no row-level backfill.

DROP TABLE IF EXISTS remote_memberships CASCADE;
DROP TABLE IF EXISTS remote_configs CASCADE;
DROP TABLE IF EXISTS remotes CASCADE;
DROP TABLE IF EXISTS channel_settings CASCADE;
DROP TABLE IF EXISTS proxy_configs CASCADE;
DROP TABLE IF EXISTS webhook_configs CASCADE;
DROP TABLE IF EXISTS labels CASCADE;
DROP TABLE IF EXISTS channels CASCADE;
