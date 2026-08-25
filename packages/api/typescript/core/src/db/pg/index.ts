/**
 * O barril da família `pg` (ADR 0005 + ADR 0006). Espelha `db/libsql/index.ts`.
 *
 * `PgDriver` é o concreto de PRODUÇÃO (confere e recusa migração); `PGliteDriver` é o de TESTE
 * (aplica, porque um banco em-processo nasce vazio e não há passo de deploy que pudesse ter rodado).
 * Nada fora do registry nomeia um concreto.
 */
export { PgDatabaseDriver, type PgTransaction } from './PgDatabaseDriver'
export { PgDrizzleClient } from './client'
export { PgDriver } from './drivers/PgDriver'
export type { PgDriverOptions } from './drivers/PgDriver'
export { PGliteDriver, __pgliteSnapshotStats } from './drivers/PGliteDriver'
export { truncateAllTables } from './drivers/utils'
export { pgSaveWithOptimisticLock } from './saveWithOptimisticLock'
