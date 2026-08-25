import { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '@codm/contracts/db'

/**
 * `LibSqlDrizzleClient` — o handle de LEITURA da família libsql, e a identidade de token de DI dela.
 *
 * Classe abstrata, não alias: quem injeta um cliente injeta ESTA, e é ela que aparece no
 * `registerInstance` do registry. O handle de ESCRITA é o `LibSqlTransaction` de
 * `./LibSqlDatabaseDriver.ts`, **deliberadamente um tipo diferente**.
 *
 * ── a correção que volta do repo irmão ───────────────────────────────────────────────────────────
 * Este molde nasceu aqui com UM alias só (`DrizzleTransaction`) servindo às duas pontas: o `.db`
 * injetado e o handle que a transação passa ao callback. O template portou o molde e registrou o
 * defeito ao fazê-lo — com um tipo só, *"escrevi pela conexão de leitura por engano"* é uma troca do
 * MESMO tipo, logo invisível para o `tsc`. Separar os dois é o que torna esse engano um erro de
 * compilação em vez de um bug de concorrência. `tests/architecture/tx-discipline.test.ts` já cobra a
 * regra de uso que esta separação passa a documentar no tipo.
 *
 * Pinado no schema REAL (`typeof schema`), diferente do gêmeo de lá, que usa
 * `Record<string, unknown>`: o template não tem schema de produto em sqlite, e este repo tem os onze
 * contextos. É a adaptação de forma de módulo — a regra porta, o genérico não.
 */
export abstract class LibSqlDrizzleClient extends LibSQLDatabase<typeof schema> {}
