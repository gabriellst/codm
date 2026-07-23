-- 014_remote_last_message_fk.down.sql
DROP INDEX IF EXISTS idx_messages_channel_remote_occurred;
ALTER TABLE remotes DROP COLUMN IF EXISTS last_message_id;
