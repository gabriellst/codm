-- name: GetOwnerByID :one
SELECT id, name, kind, responsible_user_id, picture_url, timezone, is_disabled, disabled_reason, created_at, updated_at, version
FROM owner_owners
WHERE id = sqlc.arg(id);

-- name: InsertOwnerIfNew :exec
INSERT INTO owner_owners (id, name, kind, responsible_user_id, picture_url, timezone, is_disabled, disabled_reason, created_at, updated_at, version)
VALUES (sqlc.arg(id), sqlc.arg(name), sqlc.arg(kind), sqlc.arg(responsible_user_id), sqlc.arg(picture_url), sqlc.arg(timezone), sqlc.arg(is_disabled), sqlc.arg(disabled_reason), sqlc.arg(created_at), sqlc.arg(updated_at), sqlc.arg(version))
ON CONFLICT(id) DO NOTHING;
