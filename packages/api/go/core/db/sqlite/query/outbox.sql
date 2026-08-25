-- name: InsertOutboxRow :exec
INSERT INTO shared_outbox (id, name, entity_id, owner_id, payload, source, created_at)
VALUES (sqlc.arg(id), sqlc.arg(name), sqlc.arg(entity_id), sqlc.arg(owner_id), sqlc.arg(payload), sqlc.arg(source), sqlc.arg(created_at));

-- name: GetOutboxRow :one
SELECT id, name, entity_id, owner_id, payload, source, processed_at, attempts, last_error, created_at
FROM shared_outbox
WHERE id = sqlc.arg(id);

-- name: ListUnprocessed :many
SELECT id, name, entity_id, owner_id, payload, source, processed_at, attempts, last_error, created_at
FROM shared_outbox
WHERE source = sqlc.arg(source) AND processed_at IS NULL
ORDER BY created_at
LIMIT sqlc.arg(lim);

-- name: MarkProcessed :exec
UPDATE shared_outbox SET processed_at = sqlc.arg(processed_at) WHERE id = sqlc.arg(id);
