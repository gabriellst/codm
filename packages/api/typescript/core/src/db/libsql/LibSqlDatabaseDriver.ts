import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '@codm/contracts/db'
import { DatabaseDriver } from '../drivers/DatabaseDriver'
import type { LibSqlDrizzleClient } from './client'

/**
 * O handle de ESCRITA que o callback de `LibSqlDatabaseDriver.transaction()` recebe.
 *
 * Alias, não classe: ao contrário do `LibSqlDrizzleClient` (leitura), o handle de escrita nunca é
 * identidade de token de DI — ele só existe como parâmetro de callback. Distinto do de leitura de
 * propósito, mesmo os dois embrulhando a mesma forma: ver o docblock de `./client.ts` para o defeito
 * que a fusão dos dois escondia.
 */
export type LibSqlTransaction = LibSQLDatabase<typeof schema>

/**
 * `LibSqlDatabaseDriver` — o MEIO da família libsql (ADR 0006), irmão de `pg/PgDatabaseDriver.ts`.
 *
 * Pina o handle de leitura em `LibSqlDrizzleClient` e — ao contrário da família pg — declara a
 * própria `transaction()`. A família pg não precisa disso no nível-meio: o
 * `PgDrizzleClient.transaction()` nativo do `drizzle-orm/node-postgres` é seguro de chamar direto.
 *
 * No libsql **não é**, e está medido: pedir uma transação ao cliente (ou à sessão drizzle que o
 * embrulha) entrega a conexão nativa ao objeto de transação e nunca a retoma — 500 transações
 * deixam 1002 descritores abertos contra uma linha de base de 4, linear, sem platô, e o GC não
 * coleta. Pior e mais silencioso: como o cliente abre uma conexão SUBSTITUTA, as pragmas aplicadas
 * na abertura somem — `busy_timeout` medido de volta em 0 (de 5000) e `foreign_keys` de volta em 1
 * (de 0), sem erro nenhum. Detalhe em
 * `.plans/artifacts/2026-07-26-tx-concurrency-gate.md` e no docblock do concreto.
 *
 * Por isso o concreto desta família dirige `BEGIN IMMEDIATE` na mão, numa conexão de escrita
 * dedicada, e este método abstrato é a costura pela qual um `UnitOfWork` alcança esse mecanismo sem
 * saber que ele existe.
 */
export abstract class LibSqlDatabaseDriver extends DatabaseDriver {
	abstract readonly db: LibSqlDrizzleClient
	abstract transaction<Return>(fn: (tx: LibSqlTransaction) => Promise<Return>): Promise<Return>
}
