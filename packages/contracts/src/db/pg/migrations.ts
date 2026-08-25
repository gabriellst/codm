import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Caminho absoluto para as migrações do TRONCO CLOUD (dialeto `postgresql`, ADR 0005).
 *
 * Gêmeo de `src/db/migrations.ts`, que faz o mesmo para o tronco SQLite — e a diferença entre os dois
 * não é de caminho, é de DOUTRINA:
 *
 * - o tronco SQLite é APLICADO no boot, por dois migradores idempotentes sobre o mesmo ledger;
 * - este aqui **não é aplicado por ninguém em runtime**. A migração de nuvem é passo de deploy
 *   (`bun migrate:deploy:cloud`), e o que o boot faz é **CONFERIR**: `PgDriver.readMigrations()` lê
 *   este diretório contra o ledger `drizzle.__drizzle_migrations` e recusa subir se houver pendência.
 *
 * Por isso este módulo exporta o diretório e o LEDGER esperado: quem confere precisa dos dois, e
 * deixar o nome da tabela de ledger escrito no driver seria a segunda cópia.
 *
 * `CODM_CLOUD_MIGRATIONS_DIR` existe pela mesma razão do gêmeo: quando este módulo é consumido de
 * dentro de um bundle (`bun build --target=node`), o bundler reescreve `import.meta.url` para o
 * arquivo de SAÍDA, e o fallback resolveria um caminho que não existe. Quem empacota estagia as
 * migrações e aponta a variável.
 */
export const cloudMigrationsDir = process.env.CODM_CLOUD_MIGRATIONS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'migrations')

/**
 * O ledger que o `drizzle-kit migrate` escreve no Postgres.
 *
 * Um ledger PRÓPRIO, separado do `_sqlite_migrations` do outro tronco — e isso é o correto aqui,
 * não o defeito que era no caso SQLite: são dois BANCOS diferentes, não duas visões do mesmo
 * arquivo (ADR 0005).
 */
export const CLOUD_MIGRATIONS_LEDGER = { schema: 'drizzle', table: '__drizzle_migrations' } as const
