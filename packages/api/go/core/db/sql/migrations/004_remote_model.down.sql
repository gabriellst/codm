-- Reverse migration 004: restore chats/groups/group_participants, drop remote tables.

-- Restore chats
CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    remote_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    chat_type TEXT NOT NULL DEFAULT 'DIRECT',
    marked_as_unread BOOLEAN NOT NULL DEFAULT false,
    archived BOOLEAN NOT NULL DEFAULT false,
    pinned BOOLEAN NOT NULL DEFAULT false,
    mute_expiration TEXT NOT NULL DEFAULT '',
    profile_picture_url TEXT NOT NULL DEFAULT '',
    platform_jid TEXT NOT NULL DEFAULT '',
    platform TEXT NOT NULL DEFAULT 'WHATSAPP',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_chats_channel_id ON chats (channel_id);
CREATE INDEX IF NOT EXISTS idx_chats_remote_id ON chats (remote_id);
CREATE INDEX IF NOT EXISTS idx_chats_chat_type ON chats (chat_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_channel_remote_id ON chats (channel_id, remote_id);

-- Restore groups
CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    remote_id TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    profile_picture_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_remote_id ON groups (remote_id);

-- Restore group_participants
CREATE TABLE IF NOT EXISTS group_participants (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    remote_id TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'MEMBER',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_group_participants_group_id ON group_participants (group_id);
CREATE INDEX IF NOT EXISTS idx_group_participants_remote_id ON group_participants (remote_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_participants_group_remote ON group_participants (group_id, remote_id);

-- Drop remote tables
DROP TABLE IF EXISTS remote_memberships;
DROP TABLE IF EXISTS remote_configs;
DROP TABLE IF EXISTS remotes;
