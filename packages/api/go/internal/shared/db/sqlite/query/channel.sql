-- Channel Gateway (BC1) queries over the shared SQLite store.
--
-- Only the STATIC shapes live here: every query whose SQL text is fixed at
-- compile time. The typed structs sqlc emits (GatewayChannel / GatewayMessage /
-- GatewayRemote) are the drift guard with teeth: a contract column rename
-- regenerates them and breaks go build in the repositories rather than
-- surfacing as a runtime no-such-column error.
--
-- Deliberately NOT here (they stay hand-written in the repositories):
--   * dynamically composed WHERE/ORDER clauses (remote List, message
--     ListByRemote cursor pagination),
--   * multi-row VALUES batches (UpsertAll, UpsertAllIfNew, bulk memberships),
--   * upserts and updates that bind the same value twice (forward-only MAX
--     merges, ON CONFLICT DO UPDATE ... version + 1).
--
-- NOTE: never put an apostrophe in a comment in this file. The sqlc SQLite
-- lexer treats it as the start of a string literal and the parse fails with a
-- misleading "extraneous input ?1".

-- ---------------------------------------------------------------------------
-- gateway_channels
-- ---------------------------------------------------------------------------

-- name: GetGatewayChannel :one
SELECT id, owner_id, platform, name, owner_remote_id, credentials,
       status, created_at, updated_at, version
FROM gateway_channels
WHERE id = sqlc.arg(id);

-- name: GetGatewayChannelByName :one
SELECT id, owner_id, platform, name, owner_remote_id, credentials,
       status, created_at, updated_at, version
FROM gateway_channels
WHERE name = sqlc.arg(name) AND status != sqlc.arg(deleted_status);

-- name: GetGatewayChannelByOwnerPlatform :one
SELECT id, owner_id, platform, name, owner_remote_id, credentials,
       status, created_at, updated_at, version
FROM gateway_channels
WHERE owner_id = sqlc.arg(owner_id)
  AND platform = sqlc.arg(platform)
  AND status != sqlc.arg(deleted_status)
ORDER BY created_at DESC
LIMIT 1;

-- name: CountGatewayChannelsByOwner :one
SELECT CAST(COUNT(*) AS INTEGER) AS total
FROM gateway_channels
WHERE owner_id = sqlc.arg(owner_id) AND status != sqlc.arg(deleted_status);

-- name: ListGatewayChannelsByOwner :many
SELECT id, owner_id, platform, name, owner_remote_id, credentials,
       status, created_at, updated_at, version
FROM gateway_channels
WHERE owner_id = sqlc.arg(owner_id) AND status != sqlc.arg(deleted_status)
ORDER BY created_at DESC
LIMIT sqlc.arg(lim) OFFSET sqlc.arg(off);

-- name: ListActiveGatewayChannels :many
SELECT id, owner_id, platform, name, owner_remote_id, credentials,
       status, created_at, updated_at, version
FROM gateway_channels
WHERE status IN (sqlc.arg(connected_status), sqlc.arg(connecting_status))
  AND owner_remote_id != ''
ORDER BY created_at ASC;

-- name: DeleteGatewayChannel :exec
DELETE FROM gateway_channels WHERE id = sqlc.arg(id);

-- ---------------------------------------------------------------------------
-- gateway_messages
-- ---------------------------------------------------------------------------

-- name: GetGatewayMessage :one
SELECT id, channel_id, remote_id, platform_message_id, direction, platform,
       sender_remote_id, message_type, content, occurred_at, observed_at,
       delivered_at, seen_at, edited_at, deleted_at, version
FROM gateway_messages
WHERE id = sqlc.arg(id);

-- name: GetGatewayMessageByPlatformID :one
SELECT id, channel_id, remote_id, platform_message_id, direction, platform,
       sender_remote_id, message_type, content, occurred_at, observed_at,
       delivered_at, seen_at, edited_at, deleted_at, version
FROM gateway_messages
WHERE channel_id = sqlc.arg(channel_id)
  AND platform_message_id = sqlc.arg(platform_message_id);

-- name: ListLIDRemoteIDs :many
SELECT DISTINCT remote_id
FROM gateway_messages
WHERE channel_id = sqlc.arg(channel_id) AND remote_id LIKE '%@lid';

-- ---------------------------------------------------------------------------
-- gateway_remotes
-- ---------------------------------------------------------------------------

-- name: GetGatewayRemote :one
SELECT channel_id, remote_id, type, platform, name, avatar_url, is_blocked,
       pinned_at, archived, mute_expiration, marked_as_unread,
       unread_message_count, last_message_at, last_message_id, deleted_at,
       created_at, updated_at, version
FROM gateway_remotes
WHERE channel_id = sqlc.arg(channel_id) AND remote_id = sqlc.arg(remote_id);

-- name: ListGatewayRemotesByChannel :many
SELECT channel_id, remote_id, type, platform, name, avatar_url, is_blocked,
       pinned_at, archived, mute_expiration, marked_as_unread,
       unread_message_count, last_message_at, last_message_id, deleted_at,
       created_at, updated_at, version
FROM gateway_remotes
WHERE channel_id = sqlc.arg(channel_id);

-- name: GetGatewayRemoteAggregate :one
-- Invariant-bearing columns only, plus the owning channel owner_id (the
-- remotes table does not denormalize it: origin shape).
SELECT r.type, r.platform, r.deleted_at, r.pinned_at, r.archived,
       r.mute_expiration, r.marked_as_unread, r.created_at, r.updated_at, r.version,
       COALESCE(c.owner_id, '') AS owner_id
FROM gateway_remotes r
LEFT JOIN gateway_channels c ON c.id = r.channel_id
WHERE r.channel_id = sqlc.arg(channel_id) AND r.remote_id = sqlc.arg(remote_id);

-- name: ResetGatewayRemoteUnread :exec
UPDATE gateway_remotes
SET unread_message_count = 0, marked_as_unread = 0, updated_at = sqlc.arg(updated_at)
WHERE channel_id = sqlc.arg(channel_id) AND remote_id = sqlc.arg(remote_id);

-- name: UpdateGatewayRemoteAvatar :exec
UPDATE gateway_remotes
SET avatar_url = sqlc.arg(avatar_url), updated_at = sqlc.arg(updated_at)
WHERE channel_id = sqlc.arg(channel_id) AND remote_id = sqlc.arg(remote_id);

-- ---------------------------------------------------------------------------
-- gateway_remote_memberships
-- ---------------------------------------------------------------------------

-- name: UpsertGatewayMembership :exec
INSERT INTO gateway_remote_memberships (channel_id, group_id, member_id, is_admin, joined_at)
VALUES (sqlc.arg(channel_id), sqlc.arg(group_id), sqlc.arg(member_id), sqlc.arg(is_admin), sqlc.arg(joined_at))
ON CONFLICT(channel_id, group_id, member_id) DO UPDATE SET
    is_admin = excluded.is_admin,
    joined_at = excluded.joined_at;

-- name: DeleteGatewayMembership :exec
DELETE FROM gateway_remote_memberships
WHERE channel_id = sqlc.arg(channel_id)
  AND group_id = sqlc.arg(group_id)
  AND member_id = sqlc.arg(member_id);

-- name: DeleteGatewayMembershipsByGroup :exec
DELETE FROM gateway_remote_memberships
WHERE channel_id = sqlc.arg(channel_id) AND group_id = sqlc.arg(group_id);

-- name: DeleteGatewayMembershipsByChannel :exec
DELETE FROM gateway_remote_memberships WHERE channel_id = sqlc.arg(channel_id);
