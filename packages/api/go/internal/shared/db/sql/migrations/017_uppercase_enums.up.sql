-- Uppercase direction values in messages table.
-- Matches the Go enum constants DirectionSent = "SENT" / DirectionReceived = "RECEIVED".
UPDATE messages SET direction = 'SENT'     WHERE direction = 'sent';
UPDATE messages SET direction = 'RECEIVED' WHERE direction = 'received';

-- Uppercase type values in remotes table.
-- Matches the Go enum constants RemoteTypeUser = "USER" / RemoteTypeGroup = "GROUP" /
-- RemoteTypeBroadcast = "BROADCAST".
UPDATE remotes SET type = 'USER'      WHERE type = 'user';
UPDATE remotes SET type = 'GROUP'     WHERE type = 'group';
UPDATE remotes SET type = 'BROADCAST' WHERE type = 'broadcast';

-- Note: after applying this migration the TypeScript SDK must be regenerated
-- with `bun sdk` so that the generated enum types reflect the new SCREAMING_SNAKE_CASE
-- values (e.g. DirectionEnum.SENT instead of DirectionEnum.sent).
