-- Issue (BC5 Issue Execution) context queries over the SQLite substrate. The Go
-- structs + typed methods are GENERATED from these (sqlc PULL); the domain repos
-- bind them to the shared SqliteStore, joining the caller's unit of work when a tx
-- is in context. Mirrors the TS Drizzle repositories in
-- packages/api/typescript/src/issue/repositories/*.

-- name: GetIssueByID :one
SELECT id, owner_id, thread_id, key, title, status, provider, meta, archived,
       archive_reason, completed_at, created_at, updated_at, version
FROM issue_issues
WHERE id = sqlc.arg(id);

-- name: UpsertIssue :exec
INSERT INTO issue_issues (
    id, owner_id, thread_id, key, title, status, provider, meta, archived,
    archive_reason, completed_at, created_at, updated_at, version
) VALUES (
    sqlc.arg(id), sqlc.arg(owner_id), sqlc.arg(thread_id), sqlc.arg(key), sqlc.arg(title),
    sqlc.arg(status), sqlc.arg(provider), sqlc.arg(meta), sqlc.arg(archived),
    sqlc.arg(archive_reason), sqlc.arg(completed_at), sqlc.arg(created_at), sqlc.arg(updated_at), sqlc.arg(version)
)
ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    status = excluded.status,
    meta = excluded.meta,
    archived = excluded.archived,
    archive_reason = excluded.archive_reason,
    completed_at = excluded.completed_at,
    updated_at = excluded.updated_at,
    version = excluded.version;

-- name: ListIssuesByOwnerWithThread :many
SELECT i.id, i.key, i.title, i.status, i.meta, i.archived, i.thread_id,
       t.contact_display_name AS thread_display_name
FROM issue_issues i
INNER JOIN thread_threads t ON i.thread_id = t.id
WHERE i.owner_id = sqlc.arg(owner_id);

-- name: ListIssuesByThread :many
SELECT id, key, title, status, meta, archived
FROM issue_issues
WHERE thread_id = sqlc.arg(thread_id);

-- name: GetStopByID :one
SELECT id, owner_id, issue_id, thread_id, kind, title, detail, raised_at, resolution, resolved_at
FROM issue_stops
WHERE id = sqlc.arg(id);

-- name: ResolveIssueStop :exec
UPDATE issue_stops
SET resolution = sqlc.arg(resolution), resolved_at = sqlc.arg(resolved_at)
WHERE id = sqlc.arg(id);

-- name: ListOpenStopsByIssue :many
SELECT id, kind, title, detail, raised_at
FROM issue_stops
WHERE issue_id = sqlc.arg(issue_id) AND resolved_at IS NULL
ORDER BY raised_at ASC;

-- name: ListOpenStopsByThreadWithIssueKey :many
SELECT s.id, s.issue_id, i.key AS issue_key, s.kind, s.title, s.detail, s.raised_at
FROM issue_stops s
INNER JOIN issue_issues i ON s.issue_id = i.id
WHERE s.thread_id = sqlc.arg(thread_id) AND s.resolved_at IS NULL
ORDER BY s.raised_at ASC;

-- name: GetStopPolicy :one
SELECT owner_id, server_errors, blocked_by_classification, human_requested,
       approval_needed, auth_required, updated_at, version
FROM issue_stop_policy_config
WHERE owner_id = sqlc.arg(owner_id);

-- name: UpsertStopPolicy :exec
INSERT INTO issue_stop_policy_config (
    owner_id, server_errors, blocked_by_classification, human_requested,
    approval_needed, auth_required, updated_at, version
) VALUES (
    sqlc.arg(owner_id), sqlc.arg(server_errors), sqlc.arg(blocked_by_classification),
    sqlc.arg(human_requested), sqlc.arg(approval_needed), sqlc.arg(auth_required),
    sqlc.arg(updated_at), sqlc.arg(version)
)
ON CONFLICT(owner_id) DO UPDATE SET
    server_errors = excluded.server_errors,
    blocked_by_classification = excluded.blocked_by_classification,
    human_requested = excluded.human_requested,
    approval_needed = excluded.approval_needed,
    auth_required = excluded.auth_required,
    updated_at = excluded.updated_at;

-- name: NextTerminalLineSeq :one
SELECT CAST(COALESCE(MAX(seq), 0) + 1 AS INTEGER) AS next_seq
FROM issue_terminal_lines
WHERE issue_id = sqlc.arg(issue_id);

-- name: InsertTerminalLine :exec
INSERT INTO issue_terminal_lines (id, owner_id, issue_id, seq, line, at)
VALUES (sqlc.arg(id), sqlc.arg(owner_id), sqlc.arg(issue_id), sqlc.arg(seq), sqlc.arg(line), sqlc.arg(at));

-- name: ListTerminalLinesByIssue :many
SELECT id, seq, line, at
FROM issue_terminal_lines
WHERE issue_id = sqlc.arg(issue_id)
ORDER BY seq ASC;

-- name: ListTranscriptByIssue :many
SELECT id, kind, text, classification, at
FROM thread_transcript_entries
WHERE issue_id = sqlc.arg(issue_id)
ORDER BY at ASC;
