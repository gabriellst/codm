-- name: GetThreadByID :one
SELECT id, owner_id, channel_id, contact_external_id, contact_display_name, contact_kind,
       workspace_id, providers, paused, mention_gate_enabled, mention_gate_tag, participants,
       buffer_size, status, created_at, updated_at, version
FROM thread_threads
WHERE id = sqlc.arg(id);

-- name: GetThreadByChannelContact :one
SELECT id, owner_id, channel_id, contact_external_id, contact_display_name, contact_kind,
       workspace_id, providers, paused, mention_gate_enabled, mention_gate_tag, participants,
       buffer_size, status, created_at, updated_at, version
FROM thread_threads
WHERE channel_id = sqlc.arg(channel_id) AND contact_external_id = sqlc.arg(contact_external_id)
LIMIT 1;

-- name: UpsertThread :exec
INSERT INTO thread_threads (
    id, owner_id, channel_id, contact_external_id, contact_display_name, contact_kind,
    workspace_id, providers, paused, mention_gate_enabled, mention_gate_tag, participants,
    buffer_size, status, created_at, updated_at, version
) VALUES (
    sqlc.arg(id), sqlc.arg(owner_id), sqlc.arg(channel_id), sqlc.arg(contact_external_id),
    sqlc.arg(contact_display_name), sqlc.arg(contact_kind), sqlc.arg(workspace_id), sqlc.arg(providers),
    sqlc.arg(paused), sqlc.arg(mention_gate_enabled), sqlc.arg(mention_gate_tag), sqlc.arg(participants),
    sqlc.arg(buffer_size), sqlc.arg(status), sqlc.arg(created_at), sqlc.arg(updated_at), sqlc.arg(version)
)
ON CONFLICT(id) DO UPDATE SET
    providers = excluded.providers,
    paused = excluded.paused,
    mention_gate_enabled = excluded.mention_gate_enabled,
    mention_gate_tag = excluded.mention_gate_tag,
    participants = excluded.participants,
    buffer_size = excluded.buffer_size,
    status = excluded.status,
    updated_at = excluded.updated_at,
    version = excluded.version;

-- name: DeleteThread :exec
DELETE FROM thread_threads WHERE id = sqlc.arg(id);

-- name: InsertTranscriptEntry :exec
INSERT INTO thread_transcript_entries (
    id, owner_id, thread_id, kind, text, issue_id, quoted_entry_id, sender_external_id,
    provider, classification, at, created_at
) VALUES (
    sqlc.arg(id), sqlc.arg(owner_id), sqlc.arg(thread_id), sqlc.arg(kind), sqlc.arg(text),
    sqlc.arg(issue_id), sqlc.arg(quoted_entry_id), sqlc.arg(sender_external_id), sqlc.arg(provider),
    sqlc.arg(classification), sqlc.arg(at), sqlc.arg(created_at)
);

-- name: ListTranscriptByThread :many
SELECT id, owner_id, thread_id, kind, text, issue_id, quoted_entry_id, sender_external_id,
       provider, classification, at, created_at
FROM thread_transcript_entries
WHERE thread_id = sqlc.arg(thread_id)
ORDER BY at ASC;

-- name: IsChannelConnected :one
SELECT CAST(COUNT(*) AS INTEGER) AS connected
FROM gateway_channels
WHERE id = sqlc.arg(id) AND status = 'CONNECTED';

-- name: ListGroupMembers :many
SELECT member_id, is_admin
FROM gateway_remote_memberships
WHERE channel_id = sqlc.arg(channel_id) AND group_id = sqlc.arg(group_id)
ORDER BY joined_at ASC, member_id ASC;

-- name: GetWorkspaceOwnerAndPath :one
SELECT owner_id, path
FROM workspace_workspaces
WHERE id = sqlc.arg(id);

-- name: GetChannelPlatform :one
SELECT platform
FROM gateway_channels
WHERE id = sqlc.arg(id);

-- name: ListActiveStopsByThread :many
SELECT id, kind, title, detail, raised_at
FROM issue_stops
WHERE thread_id = sqlc.arg(thread_id) AND resolved_at IS NULL
ORDER BY raised_at ASC;
