-- Swap the receipt event index from messageIds-based GIN to a composite
-- (remoteId, timestamp) B-tree matching the new watermark query.
--
-- The old idx_events_receipt_message_ids was created when ListMessagesByChat
-- filtered events by `payload->'messageIds' ? <messageId>`. The watermark
-- rewrite (see queries/messages.sql) no longer touches messageIds — it filters
-- by (name, payload->>'remoteId', payload->>'timestamp') and aggregates
-- distinct senderIds. A GIN on messageIds is dead weight; replace it with an
-- index that actually accelerates the current access pattern.
--
-- Partial + expression: only receipt rows participate, and the timestamp is
-- cast to bigint so the index can serve the `>= messages.message_timestamp`
-- range predicate directly.
DROP INDEX IF EXISTS shared.idx_events_receipt_message_ids;

CREATE INDEX IF NOT EXISTS idx_events_receipt_remote_ts
    ON shared.events (
        (payload->>'remoteId'),
        ((payload->>'timestamp')::bigint)
    )
    WHERE name = 'channel.gateway_message_receipt';
