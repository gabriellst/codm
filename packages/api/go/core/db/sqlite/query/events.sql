-- name: InsertEvent :exec
INSERT INTO shared_events (id, name, entity_id, owner_id, payload, source, occurred_at)
VALUES (sqlc.arg(id), sqlc.arg(name), sqlc.arg(entity_id), sqlc.arg(owner_id), sqlc.arg(payload), sqlc.arg(source), sqlc.arg(occurred_at))
ON CONFLICT(id) DO NOTHING;
