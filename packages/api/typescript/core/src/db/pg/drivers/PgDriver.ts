import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import * as cloudSchema from '@codm/contracts/db/pg'
import { CLOUD_MIGRATIONS_LEDGER, cloudMigrationsDir } from '@codm/contracts/db/pg/migrations'
import { Config } from '../../../utils/Config'
import { BaseError } from '../../../types/BaseError'
import type { BaseInfrastructureErrors } from '../../../errors/codes'
import type { MigrationStatus } from '../../drivers/DatabaseDriver'
import { PgDatabaseDriver } from '../PgDatabaseDriver'
import type { PgDrizzleClient } from '../client'
import { PgUnitOfWorkFactory } from '../../../services/UnitOfWork/pg/PgUnitOfWork'
import { readCloudJournal, splitByLedger, truncateAllTables } from './utils'

export interface PgDriverOptions {
	connectionString?: string
	poolMax?: number
	idleTimeoutMillis?: number
	connectionTimeoutMillis?: number
	/** De onde ler o journal. Só os testes passam — produção usa o do pacote de contratos. */
	migrationsDir?: string
}

/**
 * `PgDriver` — o concreto de PRODUÇÃO da família `pg`: o deployment de nuvem (ADR 0005).
 *
 * ── O QUE ESTE DRIVER FAZ DE DIFERENTE DE TODO OUTRO DRIVER DESTE REPO ───────────────────────────
 * **Ele não aplica migração. Ele confere e recusa.**
 *
 * O ADR 0005 decidiu que o aplicador é propriedade da FAMÍLIA: libsql aplica no boot (dois processos
 * dividem um arquivo numa máquina que ninguém opera — não há janela de deploy, então aplicar fora do
 * boot é aplicar talvez-nunca); a família pg aplica MANUALMENTE, num passo de deploy, porque um
 * Postgres gerenciado tem janela, operador e réplicas — e um migrador de boot por réplica é o
 * defeito simétrico.
 *
 * E o corolário que dá nome a este bloco: **"manual" descreve quem APLICA, nunca quem VERIFICA.** Um
 * serviço que sobe alegremente sobre um schema atrasado troca um erro de deploy — barulhento,
 * imediato, com rollback — por corrupção silenciosa de dado em produção. O molde que este arquivo
 * substitui (o `NodePgDriver` do repo irmão) lançava `NOT_IMPLEMENTED` nos dois métodos, que é o
 * pior dos mundos: promete aplicar, não aplica, e só falha se alguém chamar.
 *
 * A forma disso não custou API nova: `readMigrations()` já devolvia `MigrationStatus`
 * (`{ applied, pending }`), vendor-neutro. Conferir é ler o status e recusar quando `pending` não
 * está vazio.
 *
 * ── DE ONDE VÊM `applied` E `pending` ────────────────────────────────────────────────────────────
 * `applied` sai do ledger que o próprio `drizzle-kit migrate` escreve
 * (`drizzle.__drizzle_migrations`), casado com o `meta/_journal.json` pelo campo `when` — que é
 * exatamente como o aplicador casa. Ler a mesma fonte que o aplicador é o que impede o conferidor de
 * ter uma segunda opinião sobre a realidade.
 *
 * **Ledger ausente não é "zero aplicadas", é BANCO NÃO MIGRADO**, e cai no mesmo `pending` — subir
 * contra um Postgres vazio é o caso mais comum de "esqueci o passo de deploy", não um caso benigno.
 */
export class PgDriver extends PgDatabaseDriver {
	/**
	 * `'connection'` — o pool segura sockets de verdade e `close()` os libera. Nunca cacheável entre
	 * suítes, ao contrário do `PGliteDriver` (`'process'`).
	 */
	readonly lifetime = 'connection' as const

	static readonly POOL_MAX = 5

	readonly db: PgDrizzleClient
	readonly unitOfWorkFactory: PgUnitOfWorkFactory

	private readonly pool: Pool
	private readonly options: PgDriverOptions

	constructor(options: PgDriverOptions = {}) {
		super()
		this.options = options

		const connectionString = options.connectionString ?? Config.env.CLOUD_DATABASE_URL
		// Sem fallback para um `postgres://localhost/...` embutido: um default apontaria para QUALQUER
		// banco que exista na máquina de quem subiu, que é a forma mais barata de escrever no banco
		// errado. Faltando a URL, o deployment está mal configurado e tem de dizer isso agora.
		if (connectionString === undefined || connectionString === '') {
			throw new BaseError<BaseInfrastructureErrors>('MISSING_ENVIRONMENT_VARIABLE', 'CLOUD_DATABASE_URL')
		}

		this.pool = new Pool({
			connectionString,
			max: options.poolMax ?? PgDriver.POOL_MAX,
			idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
			connectionTimeoutMillis: options.connectionTimeoutMillis ?? 10_000,
		})

		this.db = drizzle({ client: this.pool, schema: cloudSchema }) as unknown as PgDrizzleClient
		this.unitOfWorkFactory = new PgUnitOfWorkFactory(this.db)
	}

	async create(): Promise<PgDriver> {
		return new PgDriver(this.options)
	}

	async reset(): Promise<void> {
		await truncateAllTables(this.db)
	}

	/**
	 * CONFERE e RECUSA — não aplica. Ver o bloco do topo desta classe.
	 *
	 * O nome do método é o do contrato do topo (`DatabaseDriver`), e mantê-lo é deliberado: o boot
	 * chama a mesma coisa nas duas famílias, e o que cada família FAZ com a chamada é a diferença que
	 * o ADR 0005 declarou. Um método `assertMigrated()` só nesta família obrigaria o boot a saber em
	 * qual família está — que é o `if` de caso especial que o `CLAUDE.md` proíbe.
	 */
	async runMigrations(): Promise<void> {
		const status = await this.readMigrations()
		if (status.pending.length === 0) return

		throw new BaseError<BaseInfrastructureErrors>(
			'MIGRATIONS_PENDING',
			`schema da nuvem ATRASADO: ${status.pending.length} migração(ões) pendente(s) — ${status.pending.join(', ')}. ` +
				'A família pg não aplica no boot por decisão (ADR 0005): rode `bun migrate:deploy:cloud` no passo de deploy. ' +
				'Subir sobre schema atrasado trocaria um erro de deploy por corrupção silenciosa de dado.',
		)
	}

	async readMigrations(): Promise<MigrationStatus> {
		const journal = await readCloudJournal(this.options.migrationsDir ?? cloudMigrationsDir)
		return splitByLedger(journal, await this.readLedgerStamps())
	}

	/**
	 * Os `created_at` do ledger do drizzle-kit — o mesmo campo que ele grava a partir do `when` do
	 * journal. Ledger ausente devolve conjunto vazio, e o efeito é todo o journal virar `pending`.
	 */
	private async readLedgerStamps(): Promise<Set<number>> {
		const { schema, table } = CLOUD_MIGRATIONS_LEDGER
		const present = await this.db.execute<{ exists: boolean }>(
			sql`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = ${schema} AND table_name = ${table}) AS "exists"`,
		)
		if (present.rows[0]?.exists !== true) return new Set()

		const rows = await this.db.execute<{ created_at: string | number }>(sql`SELECT created_at FROM drizzle.__drizzle_migrations`)
		return new Set(rows.rows.map(row => Number(row.created_at)))
	}

	async close(): Promise<void> {
		await this.pool.end()
	}
}
