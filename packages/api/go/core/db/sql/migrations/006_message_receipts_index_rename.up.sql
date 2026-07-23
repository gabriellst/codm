-- The event split from channel.gateway_message_receipt into
-- channel.message_delivered + channel.message_seen invalidates the
-- partial index predicate from migration 005 (which was keyed on
-- name = 'channel.gateway_message_receipt'). Rebuild it to cover both
-- new event names so ListMessagesByChat keeps getting index access on
-- (payload->>'remoteId', (payload->>'timestamp')::bigint).
DROP INDEX IF EXISTS shared.idx_events_receipt_remote_ts;

CREATE INDEX IF NOT EXISTS idx_events_message_receipts_remote_ts
    ON shared.events (
        (payload->>'remoteId'),
        ((payload->>'timestamp')::bigint)
    )
    WHERE name IN ('channel.message_delivered', 'channel.message_seen');
