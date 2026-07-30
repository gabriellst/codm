import { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from '@codm/contracts/db'

/**
 * The tsyringe token for the app-facing drizzle handle — and, since the SQLite flip, the READ
 * client.
 *
 * `DrizzleDatabaseDriver.db` (what `src/shared/registry.ts` binds to this token) is the
 * long-lived READ connection of the `LibsqlDriver`, never the write one. Writes go through
 * `uow.transaction(...)` → `DrizzleDatabaseDriver.transaction(...)`, which drives
 * `BEGIN IMMEDIATE` on a separate, dedicated write client behind a FIFO gate. Emitting an
 * INSERT/UPDATE/DELETE on this handle is forbidden: it does not hold the write lock, so it
 * either takes SQLITE_BUSY or opens an implicit transaction outside the gate.
 */
export abstract class DrizzleClient extends LibSQLDatabase<typeof schema> {}
