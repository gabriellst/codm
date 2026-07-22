DROP INDEX IF EXISTS shared.idx_events_messages_owner_message_id;
DROP INDEX IF EXISTS shared.idx_events_messages_owner_remote_ts;

CREATE TABLE IF NOT EXISTS messages (
    id uuid PRIMARY KEY,
    message_id text UNIQUE NOT NULL,
    remote_id text NOT NULL,
    sender_id text NOT NULL,
    platform text NOT NULL,
    message_type text NOT NULL,
    content jsonb NOT NULL DEFAULT '{}'::jsonb,
    message_timestamp bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_messages_remote_id ON messages (remote_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages (message_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_platform ON messages (platform);
