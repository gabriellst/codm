-- 015_platform_decoupling.down.sql
-- Reverts 015: drops the avatar-missing index, restores WhatsApp/JID naming
-- on channels and messages, and removes the platform column from remotes and
-- messages. Order is LIFO against up.sql so rename targets exist at each step.

DROP INDEX IF EXISTS idx_remotes_avatar_missing;

ALTER TABLE channels RENAME COLUMN owner_remote_id TO platform_jid;

ALTER TABLE messages RENAME COLUMN sender_remote_id TO sender_jid;
ALTER TABLE messages DROP COLUMN IF EXISTS platform;

ALTER TABLE remotes DROP COLUMN IF EXISTS platform;
