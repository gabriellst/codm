-- Drop the messages table — messages are now event-sourced from
-- shared.events. Every lifecycle step is a domain event:
--
--   channel.message_sent      → outgoing
--   channel.message_received  → incoming
--   channel.message_edited    → content revision (fold latest per messageId)
--   channel.message_deleted   → tombstone (hide messageId from reads)
--
-- The ListMessagesByChat / CountMessagesByChat / GetMessageByMessageID
-- queries now project directly over shared.events. See
-- shared/db/sql/queries/messages.sql.
--
-- No data backfill is performed. This migration is intended for early-
-- stage / development DBs. For production, emit synthetic
-- channel.message_{sent,received} events for any pre-existing rows
-- before applying this migration.
DROP TABLE IF EXISTS messages;

-- Partial composite index supporting the chat scan in ListMessagesByChat
-- and the latest-message LATERAL in the sidebar. Leading `owner_id`
-- prunes by tenant, then `payload->>'remoteId'` narrows to chat, then
-- `(payload->>'timestamp')::bigint` enables range scans for the
-- watermark predicate used by receipts.
--
-- Includes edit/delete events so the read queries can still seek by
-- owner_id + messageId through this index when folding edits and
-- checking tombstones.
CREATE INDEX IF NOT EXISTS idx_events_messages_owner_remote_ts
    ON shared.events (
        owner_id,
        (payload->>'remoteId'),
        ((payload->>'timestamp')::bigint)
    )
    WHERE name IN (
        'channel.message_sent',
        'channel.message_received',
        'channel.message_edited',
        'channel.message_deleted'
    );

-- Partial index on messageId for GetMessageByMessageID and the
-- tombstone NOT EXISTS subquery. Leading `owner_id` again prunes by
-- tenant.
CREATE INDEX IF NOT EXISTS idx_events_messages_owner_message_id
    ON shared.events (
        owner_id,
        (payload->>'messageId'),
        time DESC
    )
    WHERE name IN (
        'channel.message_sent',
        'channel.message_received',
        'channel.message_edited',
        'channel.message_deleted'
    );
