-- 015_platform_decoupling.up.sql
-- Strips WhatsApp/JID naming from projection columns and gains a `platform`
-- column on the two user-scoped projections. Column renames are atomic; the
-- `platform` column backfills to WHATSAPP for grandfathered rows, then the
-- default is dropped so all future writes must pass platform explicitly.

-- Remotes
ALTER TABLE remotes ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'WHATSAPP';
ALTER TABLE remotes ALTER COLUMN platform DROP DEFAULT;

-- Messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'WHATSAPP';
ALTER TABLE messages ALTER COLUMN platform DROP DEFAULT;
ALTER TABLE messages RENAME COLUMN sender_jid TO sender_remote_id;

-- Channels
ALTER TABLE channels RENAME COLUMN platform_jid TO owner_remote_id;

-- Avatar-missing partial index (used by the PR B picture fetcher; created here
-- so the index is present by the time the fetcher wave lands and the sweep
-- query remains fast even today).
CREATE INDEX IF NOT EXISTS idx_remotes_avatar_missing
  ON remotes (channel_id, remote_id)
  WHERE avatar_url IS NULL AND deleted_at IS NULL;
