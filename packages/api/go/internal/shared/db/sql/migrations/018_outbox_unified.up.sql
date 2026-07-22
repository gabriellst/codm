-- Drop the channel-local outbox. From now on the Go service polls
-- `shared.outbox` (co-owned with the api Drizzle migrations) filtered by
-- `source = 'channel'`. The api backend uses `source = 'api'` on the same
-- table, so both services share storage without contention.
--
-- The table is created `IF NOT EXISTS` because each service runs its own
-- migrations independently: in channel-only test environments this
-- migration must materialise the shared table; in production / dev the
-- api Drizzle migrations create it first and this becomes a no-op.

DROP INDEX IF EXISTS idx_outbox_name;
DROP INDEX IF EXISTS idx_outbox_owner_created;
DROP TABLE IF EXISTS outbox;

CREATE SCHEMA IF NOT EXISTS shared;

CREATE TABLE IF NOT EXISTS shared.outbox (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    source       TEXT NOT NULL,
    owner_id     TEXT NOT NULL,
    payload      JSONB NOT NULL,
    time         TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version      INTEGER NOT NULL DEFAULT 1,
    processed_at TIMESTAMPTZ,
    attempts     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS outbox_name_idx ON shared.outbox (name);
CREATE INDEX IF NOT EXISTS outbox_unprocessed_idx
    ON shared.outbox (source, processed_at, created_at)
    WHERE processed_at IS NULL;
