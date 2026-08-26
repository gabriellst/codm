import type { UnitOfWorkFactory } from '../../services/UnitOfWork/UnitOfWork'

/**
 * O que `readMigrations()` responde: o ledger partido entre o que já rodou e o que está em disco sem
 * ter sido aplicado.
 *
 * Substituiu uma forma que espelhava o `meta/_journal.json` do próprio drizzle-kit. Aquele arquivo é
 * escrituração de BUILD-TIME e está deliberadamente fora do runtime: os dois aplicadores da família
 * libsql (o TS aqui e o Go em `core/db/sqlite/store.go`) derivam o conjunto a aplicar de
 * `readdir → filter .sql → sort`, que é por que a cópia `//go:embed` legitimamente não tem `meta/`.
 *
 * A forma é VENDOR-NEUTRA de propósito, e é essa neutralidade que faz o ADR 0005 funcionar sem API
 * nova: a família `pg` não aplica migração (é passo de deploy, manual), mas **confere** — e conferir
 * é exatamente `readMigrations()` seguido de recusar quando `pending` não está vazio.
 */
export interface MigrationStatus {
	/** Nomes de migração já registrados como aplicados. */
	applied: string[]
	/** Nomes presentes em disco e ainda não aplicados, em ordem de aplicação. */
	pending: string[]
}

/**
 * `DatabaseDriver` — a PORTA de banco, o TOPO da hierarquia de três níveis (ADR 0006).
 *
 *   1. `DatabaseDriver` (este arquivo) — banco NO GERAL: ciclo de vida (`create`/`reset`/
 *      `runMigrations`/`readMigrations`/`close`), o eixo `lifetime` e a `unitOfWorkFactory`
 *      (neutra — o contrato `UnitOfWork` não nomeia ORM). **NÃO expõe `db`**, e é isso que dispensa
 *      o genérico `DatabaseDriver<T>`: quem só precisa de ciclo de vida (o boot em `boot.ts`, o
 *      `scripts/migrate.ts`) injeta o topo e nunca vê cliente algum.
 *   2. `LibSqlDatabaseDriver` (`../libsql/`) e `PgDatabaseDriver` (`../pg/`) — os MEIOS, um por
 *      família, cada um pinando o seu cliente de query em `.db`. Quem toca `.db` (repositórios,
 *      outbox/idempotência/fila, BetterAuth, use cases de leitura) injeta o meio da sua família.
 *   3. Os CONCRETOS (`LibSqlDriver`, `PgDriver`, `PGliteDriver`), ligados **só** pelo registry —
 *      nada fora dele nomeia uma classe concreta de driver.
 *
 * ── por que esta classe teve de nascer ───────────────────────────────────────────────────────────
 * Antes do ADR 0006 havia UM nível só, chamado `DrizzleDatabaseDriver`, e a assinatura dele nomeava
 * libsql (`db: DrizzleTransaction = LibSQLDatabase<...>`). Um driver Postgres tem `.db` do tipo
 * `NodePgDatabase` — incompatível. Não havia porte possível: ou entrava o cast que a regra 1 do
 * `CLAUDE.md` proíbe por nome, ou entrava este topo. Uma porta abstrata nunca carrega nome de
 * tecnologia; os níveis 2 e 3 são nomeados por DIALETO de propósito, porque são infra.
 *
 * ── CONTRATO DE LIFETIME ─────────────────────────────────────────────────────────────────────────
 * `lifetime` declara o eixo que a assinatura de `close()` sozinha não fala: o que a implementação
 * FAZ ao ser fechada, e quem pode cachear a instância entre chamadas.
 *
 * - `'process'` — um driver por PROCESSO, e `close()` é no-op POR CONTRATO. É disso que vive a
 *   otimização de snapshot pós-migração do PGlite: reaproveitar a mesma instância entre suítes é o
 *   ponto, não efeito colateral. Pode ser cacheada em campo `static`.
 * - `'connection'` — `close()` libera recurso real (descritor de arquivo, pool, socket). NUNCA pode
 *   ser cacheada entre suítes: reaproveitar uma instância `'connection'` que outra suíte fechou é
 *   um erro que aparece longe da causa.
 *
 * Não há default: uma família nova é obrigada pelo compilador a declarar o eixo antes de nascer.
 */
export abstract class DatabaseDriver {
	abstract readonly lifetime: 'process' | 'connection'
	abstract readonly unitOfWorkFactory: UnitOfWorkFactory

	abstract create(): Promise<DatabaseDriver>
	abstract reset(): Promise<void>
	abstract runMigrations(): Promise<void>
	abstract readMigrations(): Promise<MigrationStatus>
	abstract close(): Promise<void>
}
