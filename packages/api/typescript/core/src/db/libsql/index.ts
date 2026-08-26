/**
 * O barril da família libsql. Espelha `db/pg/index.ts` — cada família expõe o seu nível-meio, o seu
 * cliente e os seus concretos por UM ponto, e nada fora do registry nomeia um concreto.
 */
export { LibSqlDatabaseDriver } from './LibSqlDatabaseDriver'
export type { LibSqlTransaction } from './LibSqlDatabaseDriver'
export { LibSqlDrizzleClient } from './client'
export { LibSqlDriver } from './drivers/LibSqlDriver'
export type { LibSqlDriverOptions } from './drivers/LibSqlDriver'
export { resetAllTables } from './drivers/utils'
export { libSqlSaveWithOptimisticLock } from './saveWithOptimisticLock'
