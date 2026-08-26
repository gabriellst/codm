import { join } from 'node:path'
import { Config, LibSqlDriver, resolveDataDir } from '@codm/core-typescript'
import * as schema from '@codm/contracts/db'
import { migrationsDir } from '@codm/contracts/db/migrations'
import { ProductConfig } from '@shared/config/ProductConfig'

/**
 * The `real` database driver as a DECLARED CLASS (spec D3): the constructor knows its own
 * configuration (Config-derived `dbPath`), and the container owns the lifecycle — `shared/registry.ts`
 * binds this class directly (a bare class value), which `expandBindings`/`registerAll` turns into a
 * `container.registerSingleton`. That singleton IS the memoization; there is no module-scope cache
 * here, unlike the code this class replaces.
 *
 * Replaces `getRealDatabaseDriver()` and its two module-scope singletons (`emitDriverSingleton` /
 * `realDriverSingleton`) that used to live in `shared/registry.ts`.
 *
 * CODEGEN CARVE-OUT — under `EMIT_OPENAPI` the driver must be INERT: `bun sdk`/emit-openapi imports
 * the composition root only to collect routers, and `Router.registerControllers` eagerly resolves
 * every controller (→ its query use cases → this driver). Constructing the real driver there would
 * touch the user's data dir and could contend for a lock a live `bun dev` daemon already holds. So
 * under emission this constructs a temp-file driver instead — still ONE instance, because the
 * container singleton covers this branch exactly like the other one.
 *
 * Real persistence (the non-emission branch) is the SHARED, file-backed SQLite database at
 * `<CODM_DATA_DIR>/codm.db` — the very same file the Go gateway opens (`dbFileName` in
 * `core/db/sqlite/store.go`). Migrations apply on boot (see `migrateEmbeddedDatabase` in
 * `shared/registry.ts`), idempotently, from either process, in any order.
 */
export class FileLibsqlDriver extends LibSqlDriver {
	constructor() {
		super(
			Config.env.EMIT_OPENAPI === 'true'
				? { schema, migrationsDir }
				: {
						schema,
						migrationsDir,
						// EXACTLY the Go gateway's file name — a different name here means two databases.
						dbPath: join(resolveDataDir(Config.env.CODM_DATA_DIR), ProductConfig.env.CODM_DB_FILE_NAME),
					},
		)
	}
}
