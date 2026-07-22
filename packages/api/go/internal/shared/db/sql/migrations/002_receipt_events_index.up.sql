-- Partial GIN index on shared.events for fast per-message receipt lookups.
--
-- The ListMessages query derives each message's ✓ / ✓✓ / ✓✓ (read) status by
-- LATERAL-joining shared.events and filtering on
--   name = 'channel.gateway_message_receipt'
--   AND payload->'messageIds' ? <messageId>
--
-- Without an index, that's a sequential scan per row in every chat fetch.
-- A partial GIN index keyed on the 'messageIds' JSON array makes the
-- containment check (?) trivially fast AND keeps the index small because it
-- only covers receipt rows.
--
-- Defensive: uses IF NOT EXISTS because shared.events is owned by the TS
-- backend migrations and may already have companion indexes there.
CREATE INDEX IF NOT EXISTS idx_events_receipt_message_ids
    ON shared.events USING GIN ((payload->'messageIds'))
    WHERE name = 'channel.gateway_message_receipt';
