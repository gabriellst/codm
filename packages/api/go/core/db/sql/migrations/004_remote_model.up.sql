-- Migration 004: Replace chat/group/group_participant tables with remotes/remote_configs/remote_memberships.
-- This is a clean migration — existing chat data is dropped, not migrated.

-- remotes: global identity of any participant (contact, group, or channel owner)
CREATE TABLE IF NOT EXISTS remotes (
    id TEXT PRIMARY KEY,
    platform_jid TEXT NOT NULL DEFAULT '',
    platform TEXT NOT NULL DEFAULT 'WHATSAPP',
    chat_type TEXT NOT NULL DEFAULT 'DIRECT',
    name TEXT NOT NULL DEFAULT '',
    profile_picture_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_remotes_platform_jid_platform ON remotes (platform_jid, platform);
CREATE INDEX IF NOT EXISTS idx_remotes_chat_type ON remotes (chat_type);

-- remote_configs: per-viewer customisation of a remote (custom name, etc.)
-- Stateful actions (pin, archive, mute, chat_seen) are event-sourced in shared.events.
CREATE TABLE IF NOT EXISTS remote_configs (
    id TEXT PRIMARY KEY,
    remote_id TEXT NOT NULL REFERENCES remotes(id) ON DELETE CASCADE,
    owner_remote_id TEXT NOT NULL REFERENCES remotes(id) ON DELETE CASCADE,
    custom_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_remote_configs_remote_owner ON remote_configs (remote_id, owner_remote_id);
CREATE INDEX IF NOT EXISTS idx_remote_configs_owner_remote_id ON remote_configs (owner_remote_id);

-- remote_memberships: self-referencing many-to-many between remotes (group members, etc.)
CREATE TABLE IF NOT EXISTS remote_memberships (
    id TEXT PRIMARY KEY,
    remote_id TEXT NOT NULL REFERENCES remotes(id) ON DELETE CASCADE,
    member_remote_id TEXT NOT NULL REFERENCES remotes(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'MEMBER',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_remote_memberships_remote_member ON remote_memberships (remote_id, member_remote_id);
CREATE INDEX IF NOT EXISTS idx_remote_memberships_member_remote_id ON remote_memberships (member_remote_id);

-- Drop old tables (order matters due to foreign keys)
DROP TABLE IF EXISTS group_participants;
DROP TABLE IF EXISTS groups;
DROP TABLE IF EXISTS chats;
