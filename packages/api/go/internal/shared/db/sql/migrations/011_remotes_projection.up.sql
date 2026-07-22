-- Projection tables for Remote and RemoteMembership aggregates.
-- remotes: contacts and groups (remotes) in a channel
-- remote_memberships: group members
-- Written by Go projectors, read-only mirrored by TS Drizzle schemas.
-- Tables are created inside the `channel` schema via the search_path set
-- from cfg.ServiceName.

CREATE TABLE IF NOT EXISTS remotes (
  channel_id            UUID NOT NULL,
  remote_id             TEXT NOT NULL,
  type                  TEXT NOT NULL,
  name                  TEXT NOT NULL DEFAULT '',
  avatar_url            TEXT,
  is_blocked            BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_at             TIMESTAMPTZ,
  archived              BOOLEAN NOT NULL DEFAULT FALSE,
  mute_expiration       TIMESTAMPTZ,
  marked_as_unread      BOOLEAN NOT NULL DEFAULT FALSE,
  unread_message_count  INTEGER NOT NULL DEFAULT 0,
  last_message_at       TIMESTAMPTZ,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL,
  version               BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (channel_id, remote_id)
);

CREATE INDEX IF NOT EXISTS idx_remotes_last_message_at ON remotes (channel_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_remotes_type ON remotes (channel_id, type);
CREATE INDEX IF NOT EXISTS idx_remotes_pinned ON remotes (channel_id, pinned_at DESC NULLS LAST) WHERE pinned_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS remote_memberships (
  channel_id   UUID NOT NULL,
  group_id     TEXT NOT NULL,
  member_id    TEXT NOT NULL,
  is_admin     BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (channel_id, group_id, member_id),
  FOREIGN KEY (channel_id, group_id) REFERENCES remotes (channel_id, remote_id) ON DELETE CASCADE
);
