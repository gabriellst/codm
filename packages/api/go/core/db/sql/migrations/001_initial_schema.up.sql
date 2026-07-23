-- channels
CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'WHATSAPP',
    status TEXT NOT NULL DEFAULT 'CREATED',
    connection_state TEXT NOT NULL DEFAULT 'CLOSE',
    credentials JSONB NOT NULL DEFAULT '{}',
    owner_id TEXT NOT NULL DEFAULT '',
    platform_jid TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_name ON channels (name);
CREATE INDEX IF NOT EXISTS idx_channels_owner_id ON channels (owner_id);
CREATE INDEX IF NOT EXISTS idx_channels_status ON channels (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_owner_platform ON channels (owner_id, platform);

-- channel_settings
CREATE TABLE IF NOT EXISTS channel_settings (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    reject_call BOOLEAN NOT NULL DEFAULT false,
    msg_call TEXT NOT NULL DEFAULT '',
    groups_ignore BOOLEAN NOT NULL DEFAULT false,
    always_online BOOLEAN NOT NULL DEFAULT false,
    read_messages BOOLEAN NOT NULL DEFAULT false,
    read_status BOOLEAN NOT NULL DEFAULT false,
    sync_full_history BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_settings_channel_id ON channel_settings (channel_id);

-- proxy_configs
CREATE TABLE IF NOT EXISTS proxy_configs (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT false,
    host TEXT NOT NULL DEFAULT '',
    port INTEGER NOT NULL DEFAULT 0,
    protocol TEXT NOT NULL DEFAULT 'HTTP',
    username TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proxy_configs_channel_id ON proxy_configs (channel_id);

-- webhook_configs
CREATE TABLE IF NOT EXISTS webhook_configs (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    url TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT false,
    webhook_by_events BOOLEAN NOT NULL DEFAULT false,
    webhook_base64 BOOLEAN NOT NULL DEFAULT false,
    events JSONB NOT NULL DEFAULT '[]',
    headers JSONB NOT NULL DEFAULT '{}',
    owner_id TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_configs_channel_id ON webhook_configs (channel_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_owner_id ON webhook_configs (owner_id);

-- messages
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL DEFAULT '',
    remote_id TEXT NOT NULL DEFAULT '',
    message_type TEXT NOT NULL DEFAULT 'TEXT',
    content JSONB NOT NULL DEFAULT '{}',
    message_timestamp BIGINT NOT NULL DEFAULT 0,
    platform TEXT NOT NULL DEFAULT 'WHATSAPP',
    sender_id TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_message_id ON messages (message_id);
CREATE INDEX IF NOT EXISTS idx_messages_remote_id ON messages (remote_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages (message_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_platform ON messages (platform);

-- chats
CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    remote_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    chat_type TEXT NOT NULL DEFAULT 'DIRECT',
    unread_messages INTEGER NOT NULL DEFAULT 0,
    marked_as_unread BOOLEAN NOT NULL DEFAULT false,
    archived BOOLEAN NOT NULL DEFAULT false,
    pinned BOOLEAN NOT NULL DEFAULT false,
    muted BOOLEAN NOT NULL DEFAULT false,
    mute_expiration TEXT NOT NULL DEFAULT '',
    last_message_timestamp TEXT NOT NULL DEFAULT '',
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

-- labels
CREATE TABLE IF NOT EXISTS labels (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    label_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    predefined BOOLEAN NOT NULL DEFAULT false,
    owner_id TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_labels_channel_id ON labels (channel_id);
CREATE INDEX IF NOT EXISTS idx_labels_owner_id ON labels (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_channel_label_id ON labels (channel_id, label_id);

-- groups
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

-- group_participants
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

-- shared schema (owned by TS backend migrations, created here for startup order independence)
CREATE SCHEMA IF NOT EXISTS shared;

-- events (permanent, append-only event log — shared with TS backend)
CREATE TABLE IF NOT EXISTS shared.events (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    entity_id  TEXT NOT NULL,
    owner_id   TEXT NOT NULL,
    payload    JSONB NOT NULL,
    time       TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version    INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_events_entity_id ON shared.events (entity_id);
CREATE INDEX IF NOT EXISTS idx_events_owner_id ON shared.events (owner_id);
CREATE INDEX IF NOT EXISTS idx_events_name ON shared.events (name);
CREATE INDEX IF NOT EXISTS idx_events_time ON shared.events (time);

-- outbox (transient dispatch queue — per-service, stays in service schema)
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
