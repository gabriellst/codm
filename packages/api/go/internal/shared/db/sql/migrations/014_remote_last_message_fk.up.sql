-- 014_remote_last_message_fk.up.sql
-- Adds the FK column that anchors the sidebar's latest-message preview and
-- the index needed by RecomputePreviewIfLatest.

ALTER TABLE remotes ADD COLUMN IF NOT EXISTS last_message_id uuid;

CREATE INDEX IF NOT EXISTS idx_messages_channel_remote_occurred
  ON messages (channel_id, remote_id, occurred_at DESC)
  WHERE deleted_at IS NULL;
