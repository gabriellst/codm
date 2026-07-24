-- Foundation drift-guard queries.
--
-- sqlc emits a model struct per table only when at least one query references
-- the schema. These `SELECT *` queries exist so `sqlc generate` produces the
-- full set of column-typed models for every gateway + shared table; a contract
-- column rename/drop then breaks `go build` here (the compile-time drift guard
-- that would have caught the lean/rich divergence). The repos-adopt-generated-
-- structs step (Phase 2) replaces/extends these with the real query set.

-- name: ListChannelsRows :many
SELECT * FROM gateway.channels;

-- name: ListMessagesRows :many
SELECT * FROM gateway.messages;

-- name: ListRemotesRows :many
SELECT * FROM gateway.remotes;

-- name: ListRemoteMembershipsRows :many
SELECT * FROM gateway.remote_memberships;

-- name: ListEventsRows :many
SELECT * FROM shared.events;

-- name: ListOutboxRows :many
SELECT * FROM shared.outbox;

-- name: ListIdempotencyKeysRows :many
SELECT * FROM shared.idempotency_keys;

-- name: ListScheduledCommandsRows :many
SELECT * FROM shared.scheduled_commands;
