DROP INDEX IF EXISTS shared.idx_events_receipt_remote_ts;

CREATE INDEX IF NOT EXISTS idx_events_receipt_message_ids
    ON shared.events USING GIN ((payload->'messageIds'))
    WHERE name = 'channel.gateway_message_receipt';
