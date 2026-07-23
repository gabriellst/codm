-- Revert direction values in messages table to lowercase.
UPDATE messages SET direction = 'sent'     WHERE direction = 'SENT';
UPDATE messages SET direction = 'received' WHERE direction = 'RECEIVED';

-- Revert type values in remotes table to lowercase.
UPDATE remotes SET type = 'user'      WHERE type = 'USER';
UPDATE remotes SET type = 'group'     WHERE type = 'GROUP';
UPDATE remotes SET type = 'broadcast' WHERE type = 'BROADCAST';
