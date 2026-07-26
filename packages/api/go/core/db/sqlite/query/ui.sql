-- ui.sql - the BFF (ui bounded context) cross-context READ queries over the SQLite
-- substrate (go-domain port). ui owns no tables of its own: it composes read shapes
-- from the gateway/thread/issue/workspace/owner tables the write-side contexts own.
-- Every query is owner-scoped and read-only (no writes, no UoW) - the BFF pattern.
--
-- The dynamic contact-directory page (optional search + keyset cursor + IN-list over
-- the owner's channels) is expressed as raw SQL in the query service, not here - sqlc
-- can't cleanly template the optional keyset predicate. Everything static lives here.

-- name: ListOwnersByResponsibleUser :many
SELECT id, name
FROM owner_owners
WHERE responsible_user_id = sqlc.arg(responsible_user_id)
ORDER BY created_at;

-- name: CountConnectedChannels :one
SELECT CAST(COUNT(*) AS INTEGER) AS present
FROM gateway_channels
WHERE owner_id = sqlc.arg(owner_id) AND status = 'CONNECTED';

-- name: CountWorkspacesForOwner :one
SELECT CAST(COUNT(*) AS INTEGER) AS present
FROM workspace_workspaces
WHERE owner_id = sqlc.arg(owner_id);

-- name: CountThreadsForOwner :one
SELECT CAST(COUNT(*) AS INTEGER) AS present
FROM thread_threads
WHERE owner_id = sqlc.arg(owner_id);

-- name: ListIssuesForHome :many
SELECT id, status, archived, completed_at, created_at
FROM issue_issues
WHERE owner_id = sqlc.arg(owner_id);

-- name: ListThreadsForHome :many
SELECT
    t.id,
    t.contact_display_name,
    t.status,
    t.providers,
    t.updated_at,
    w.path AS workspace_path,
    c.platform AS channel_platform
FROM thread_threads t
LEFT JOIN workspace_workspaces w ON t.workspace_id = w.id
LEFT JOIN gateway_channels c ON t.channel_id = c.id
WHERE t.owner_id = sqlc.arg(owner_id);

-- name: ListOpenStopsForHome :many
SELECT thread_id, kind
FROM issue_stops
WHERE owner_id = sqlc.arg(owner_id) AND resolved_at IS NULL;

-- name: ListRecentTranscriptForHome :many
SELECT text, thread_id, at, kind
FROM thread_transcript_entries
WHERE owner_id = sqlc.arg(owner_id)
ORDER BY at DESC
LIMIT 8;

-- name: ListChannelsForHome :many
SELECT platform, status
FROM gateway_channels
WHERE owner_id = sqlc.arg(owner_id);

-- name: ListChannelsForWizard :many
SELECT id, platform, status
FROM gateway_channels
WHERE owner_id = sqlc.arg(owner_id);

-- name: ListWorkspacesForWizard :many
SELECT id, path, badges
FROM workspace_workspaces
WHERE owner_id = sqlc.arg(owner_id);

-- name: ListThreadKeysForOwner :many
SELECT channel_id, contact_external_id
FROM thread_threads
WHERE owner_id = sqlc.arg(owner_id);
