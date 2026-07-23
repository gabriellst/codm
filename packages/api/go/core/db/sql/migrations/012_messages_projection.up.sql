-- Projection table for Message aggregate.
-- Written by Go messageProjector, read-only mirrored by TS Drizzle schemas.
-- Table is created inside the `channel` schema via the search_path set
-- from cfg.ServiceName.

CREATE TABLE IF NOT EXISTS messages (
  id                    UUID PRIMARY KEY,
  channel_id            UUID NOT NULL,
  remote_id             TEXT NOT NULL,
  platform_message_id   TEXT NOT NULL,
  direction             TEXT NOT NULL,
  sender_jid            TEXT NOT NULL,
  content               JSONB NOT NULL,
  occurred_at           TIMESTAMPTZ NOT NULL,
  observed_at           TIMESTAMPTZ NOT NULL,
  delivered_at          TIMESTAMPTZ,
  seen_at               TIMESTAMPTZ,
  edited_at             TIMESTAMPTZ,
  deleted_at            TIMESTAMPTZ,
  version               BIGINT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_channel_platform ON messages (channel_id, platform_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_remote ON messages (channel_id, remote_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages (channel_id, occurred_at DESC);
