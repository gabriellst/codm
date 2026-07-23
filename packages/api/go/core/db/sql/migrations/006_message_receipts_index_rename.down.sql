DROP INDEX IF EXISTS shared.idx_events_message_receipts_remote_ts;

CREATE INDEX IF NOT EXISTS idx_events_receipt_remote_ts
    ON shared.events (
        (payload->>'remoteId'),
        ((payload->>'timestamp')::bigint)
    )
    WHERE name = 'channel.gateway_message_receipt';
