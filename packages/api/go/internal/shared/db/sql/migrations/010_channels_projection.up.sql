-- Projection table for Channel aggregate.
-- Written by Go channelProjector, read-only mirrored by TS Drizzle schemas.
--
-- T6 extended (2026-04-17): added name, platform_jid, credentials,
-- connection_state to allow PgChannelRepository.ReconstructChannel without
-- replaying events. These columns exist while the entity carries those fields;
-- they will be dropped alongside the entity fields in a later task.

CREATE TABLE IF NOT EXISTS channels (
  id                UUID PRIMARY KEY,
  owner_id          TEXT NOT NULL,
  platform          TEXT NOT NULL,
  name              TEXT NOT NULL,
  platform_jid      TEXT NOT NULL DEFAULT '',
  credentials       JSONB NOT NULL DEFAULT '{}'::jsonb,
  connection_state  TEXT NOT NULL DEFAULT 'close',
  status            TEXT NOT NULL,
  connected_at      TIMESTAMPTZ,
  disconnected_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL,
  version           BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_channels_owner_id ON channels (owner_id);
CREATE INDEX IF NOT EXISTS idx_channels_owner_platform ON channels (owner_id, platform);
CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_name ON channels (name);
