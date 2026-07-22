-- Restore the channel-local outbox that 001_initial_schema previously owned.
DROP INDEX IF EXISTS outbox_unprocessed_idx;
DROP INDEX IF EXISTS outbox_name_idx;
DROP TABLE IF EXISTS shared.outbox;

CREATE TABLE IF NOT EXISTS outbox (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    owner_id     TEXT NOT NULL,
    payload      JSONB NOT NULL,
    time         TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version      INTEGER NOT NULL DEFAULT 1,
    processed_at TIMESTAMPTZ,
    attempts     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_outbox_name ON outbox (name);
CREATE INDEX IF NOT EXISTS idx_outbox_owner_created ON outbox (owner_id, created_at) WHERE processed_at IS NULL;
