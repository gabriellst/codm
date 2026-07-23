-- Tenant-scope the per-message receipt lookup.
--
-- Previous migrations (005, 006) indexed on (payload->>'remoteId',
-- (payload->>'timestamp')::bigint) but ignored shared.events.owner_id.
-- That's a correctness bug in multi-tenant setups: two tenants with the
-- same remoteId (e.g. a widely-shared WhatsApp contact) would see their
-- receipts aggregated together.
--
-- This migration replaces the old partial index with a version that
-- leads on owner_id so ListMessagesByChat can prune by tenant before
-- touching JSON. Keeps the query fast even as shared.events grows
-- globally — each tenant's scan stays selective.
DROP INDEX IF EXISTS shared.idx_events_message_receipts_remote_ts;

CREATE INDEX IF NOT EXISTS idx_events_message_receipts_owner_remote_ts
    ON shared.events (
        owner_id,
        (payload->>'remoteId'),
        ((payload->>'timestamp')::bigint)
    )
    WHERE name IN ('channel.message_delivered', 'channel.message_seen');
