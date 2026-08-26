-- name: GetWorkspaceByID :one
SELECT id, owner_id, path, badges, added_at, created_at, updated_at, version
FROM workspace_workspaces
WHERE id = sqlc.arg(id);

-- name: GetWorkspaceByOwnerAndPath :one
SELECT id, owner_id, path, badges, added_at, created_at, updated_at, version
FROM workspace_workspaces
WHERE owner_id = sqlc.arg(owner_id) AND path = sqlc.arg(path);

-- name: UpsertWorkspace :exec
INSERT INTO workspace_workspaces (id, owner_id, path, badges, added_at, created_at, updated_at, version)
VALUES (sqlc.arg(id), sqlc.arg(owner_id), sqlc.arg(path), sqlc.arg(badges), sqlc.arg(added_at), sqlc.arg(created_at), sqlc.arg(updated_at), sqlc.arg(version))
ON CONFLICT(id) DO UPDATE SET
    path = excluded.path,
    badges = excluded.badges,
    updated_at = excluded.updated_at,
    version = excluded.version;

-- name: DeleteWorkspace :exec
DELETE FROM workspace_workspaces WHERE id = sqlc.arg(id);

-- name: ListWorkspacesWithThreadCount :many
SELECT
    w.id,
    w.owner_id,
    w.path,
    w.badges,
    w.added_at,
    w.created_at,
    w.updated_at,
    w.version,
    CAST(COUNT(t.id) AS INTEGER) AS thread_count
FROM workspace_workspaces w
LEFT JOIN thread_threads t ON t.workspace_id = w.id
WHERE w.owner_id = sqlc.arg(owner_id)
GROUP BY w.id
ORDER BY w.added_at;

-- name: CountWorkingIssuesForWorkspace :one
SELECT CAST(COUNT(*) AS INTEGER) AS working
FROM issue_issues i
JOIN thread_threads t ON i.thread_id = t.id
WHERE t.workspace_id = sqlc.arg(workspace_id)
  AND i.status = sqlc.arg(status)
  AND i.archived = 0;
