-- Artifact (BC6 Artifact Registry) context queries over the SQLite substrate. The
-- Go structs + typed methods are GENERATED from these (sqlc PULL); the domain
-- repos bind them to the shared SqliteStore, joining the caller's unit of work
-- when a tx is in context. Mirrors the TS Drizzle repository in
-- packages/api/typescript/src/artifact/repositories/*.

-- name: GetArtifactByID :one
SELECT id, owner_id, thread_id, issue_id, kind, name, ref, meta, recorded_at, created_at
FROM artifact_artifacts
WHERE id = sqlc.arg(id);

-- name: ListArtifactsByThread :many
SELECT id, owner_id, thread_id, issue_id, kind, name, ref, meta, recorded_at, created_at
FROM artifact_artifacts
WHERE thread_id = sqlc.arg(thread_id)
ORDER BY recorded_at DESC;

-- name: InsertArtifact :exec
INSERT INTO artifact_artifacts (
    id, owner_id, thread_id, issue_id, kind, name, ref, meta, recorded_at, created_at
) VALUES (
    sqlc.arg(id), sqlc.arg(owner_id), sqlc.arg(thread_id), sqlc.arg(issue_id), sqlc.arg(kind),
    sqlc.arg(name), sqlc.arg(ref), sqlc.arg(meta), sqlc.arg(recorded_at), sqlc.arg(created_at)
)
ON CONFLICT(id) DO NOTHING;

-- name: ArtifactThreadExists :one
SELECT CAST(COUNT(*) AS INTEGER) AS present
FROM thread_threads
WHERE id = sqlc.arg(id);

-- name: ArtifactIssueExists :one
SELECT CAST(COUNT(*) AS INTEGER) AS present
FROM issue_issues
WHERE id = sqlc.arg(id);
