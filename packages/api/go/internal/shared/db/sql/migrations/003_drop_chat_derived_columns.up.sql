-- Drop derived columns from chats table.
-- unread_messages: now computed from COUNT(messages after last chat.chat_seen event)
-- last_message_timestamp: now computed from MAX(messages.message_timestamp) via LATERAL subquery
-- muted: derived from mute_expiration via IsMuted() — redundant column
ALTER TABLE chats DROP COLUMN IF EXISTS unread_messages;
ALTER TABLE chats DROP COLUMN IF EXISTS last_message_timestamp;
ALTER TABLE chats DROP COLUMN IF EXISTS muted;
