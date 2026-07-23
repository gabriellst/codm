-- WARNING: data is not recoverable.
-- This only recreates empty table structures from the original migrations.
-- See 001_initial_schema.up.sql and 004_remote_model.up.sql for the original
-- definitions. Restoring requires copying those CREATE TABLE statements here.

-- Intentionally left as a no-op with this comment — the migration represents
-- a one-way architectural change. A true downgrade would require unwinding
-- multiple subsequent schema and code changes (sqlc regen, Go code that now
-- reads from shared.events would need to be reverted, etc.).
