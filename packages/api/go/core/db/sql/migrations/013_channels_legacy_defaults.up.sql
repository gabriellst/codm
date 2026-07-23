-- Make the T6 legacy columns on `channels` default-safe so the projection
-- repository (which does not carry these fields) can upsert rows without
-- violating NOT NULL constraints. The columns are scheduled for removal once
-- the entity drops them. The unique index on `name` also came from the legacy
-- era when name was the external identifier; owner+platform is the real
-- uniqueness constraint (`idx_channels_owner_platform`).

ALTER TABLE channels ALTER COLUMN name SET DEFAULT '';
DROP INDEX IF EXISTS idx_channels_name;
