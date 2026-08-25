import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as cloudSchema from '@codm/contracts/db/pg'

/**
 * `PgDrizzleClient` — o handle de query da família `pg`, e a identidade de token de DI dela.
 *
 * Pinado no TRONCO CLOUD (`@codm/contracts/db/pg`), não no tronco SQLite. É a metade do ADR 0005
 * que mais decide: os dois troncos existem porque são dialetos diferentes com tabelas diferentes, e
 * um cliente pg tipado pelo schema sqlite prometeria ao `tsc` tabelas que não existem no Postgres —
 * `workspace_*`, `thread_*`, `issue_*`. A checagem de escopo é gate
 * (`tests/architecture/trunk-parity.test.ts`, TRK-01), mas o tipo é a primeira barreira.
 *
 * Ao contrário do gêmeo libsql, esta família NÃO declara `transaction()` no nível-meio: o
 * `NodePgDatabase.transaction()` nativo é seguro de chamar direto. O libsql precisa por medição —
 * ver o docblock de `../libsql/LibSqlDatabaseDriver.ts`.
 */
export abstract class PgDrizzleClient extends NodePgDatabase<typeof cloudSchema> {}
