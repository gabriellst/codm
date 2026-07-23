CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_name ON channels (name);
ALTER TABLE channels ALTER COLUMN name DROP DEFAULT;
