import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as cloudSchema from '@codm/contracts/db/pg'
import { cloudMigrationsDir } from '@codm/contracts/db/pg/migrations'
import type { UnitOfWorkFactory } from '../../../services/UnitOfWork/UnitOfWork'
import { PgUnitOfWorkFactory } from '../../../services/UnitOfWork/pg/PgUnitOfWork'
import type { MigrationStatus } from '../../drivers/DatabaseDriver'
import { PgDatabaseDriver } from '../PgDatabaseDriver'
import type { PgDrizzleClient } from '../client'
import { readCloudJournal, truncateAllTables } from './utils'

/**
 * O snapshot pós-migração, por PROCESSO. A primeira suíte que migra paga o custo; toda suíte
 * seguinte no mesmo processo sobe carregando o dump — que é exatamente por que este driver é
 * `lifetime = 'process'` e por que `close()` é no-op por contrato.
 */
let snapshot: Blob | null = null
let migratedCount = 0
let loadedCount = 0

/**
 * Contadores, sem reset — e a ausência do reset é o desenho, não esquecimento.
 *
 * Um teste que LIMPASSE o snapshot sabotaria justamente o que mede: forçaria a próxima suíte do
 * processo a repetir a migração, e o arquivo que prova que a otimização funciona seria a razão de
 * ela parar de funcionar. Testemunhas asseguram sobre DELTAS em torno dos próprios drivers, o que
 * também as torna independentes da ordem em que o `bun` resolve carregar os arquivos.
 */
export function __pgliteSnapshotStats(): { migrated: number; loaded: number } {
	return { migrated: migratedCount, loaded: loadedCount }
}

interface Materialised {
	pg: PGlite
	db: PgDrizzleClient
	unitOfWorkFactory: UnitOfWorkFactory
}

/**
 * `PGliteDriver` — o concreto de TESTE da família `pg`: Postgres de verdade, dentro do processo.
 *
 * ── por que ele APLICA migração e o `PgDriver` RECUSA ────────────────────────────────────────────
 * Parece contradizer o ADR 0005 ("a família `pg` não aplica no boot"), e não contradiz. O ADR fala
 * de **deployment**: um Postgres gerenciado tem janela de deploy, operador e réplicas, e por isso o
 * aplicador é um passo de fora e o boot só confere.
 *
 * Um PGlite de teste não tem nada disso. Ele nasce VAZIO a cada processo, não há passo de deploy que
 * pudesse ter rodado, e um driver que recusasse subir por schema atrasado deixaria a suíte sem banco
 * nenhum. Aqui o "passo de deploy" é literalmente esta chamada.
 *
 * Os dois concretos honram a MESMA porta e o mesmo contrato de `MigrationStatus`; o que difere é o
 * fato do mundo que cada um descreve. É por isso que a decisão do ADR 0005 é da FAMÍLIA e a
 * mecânica é do CONCRETO.
 *
 * ── `MigrationStatus` aqui é binário, e isso é honesto ───────────────────────────────────────────
 * Este driver repete o journal INTEIRO uma vez por processo (ou sobe do snapshot, que É o resultado
 * dessa repetição). Não existe ledger por migração nesta camada, então "aplicadas vs pendentes"
 * colapsa em dois estados: nada aplicado antes da primeira migração, tudo aplicado depois. Não há
 * estado parcial a reportar — e inventar um seria mentir na forma neutra.
 */
export class PGliteDriver extends PgDatabaseDriver {
	readonly lifetime = 'process' as const

	private readonly migrationsDir: string
	private materialised: Materialised | null = null
	/**
	 * Separado de `materialised` de propósito: os getters conseguem levantar um PGlite VAZIO antes de
	 * `runMigrations()` rodar (um consumidor que leia `.db` primeiro), e aí `materialised !== null`
	 * mentiria para `readMigrations()` sobre o schema existir.
	 */
	private migrated = false

	constructor(options: { migrationsDir?: string } = {}) {
		super()
		this.migrationsDir = options.migrationsDir ?? cloudMigrationsDir
	}

	get db(): PgDrizzleClient {
		return this.materialise(false).db
	}

	get unitOfWorkFactory(): UnitOfWorkFactory {
		return this.materialise(false).unitOfWorkFactory
	}

	private materialise(fromSnapshot: boolean): Materialised {
		if (this.materialised) return this.materialised

		const useSnapshot = fromSnapshot && snapshot !== null
		const pg = useSnapshot ? new PGlite({ loadDataDir: snapshot as Blob }) : new PGlite()
		if (useSnapshot) loadedCount++

		const db = drizzle({ client: pg, schema: cloudSchema }) as unknown as PgDrizzleClient
		this.materialised = { pg, db, unitOfWorkFactory: new PgUnitOfWorkFactory(db) }
		return this.materialised
	}

	/** `lifetime = 'process'`: `create()` devolve o MESMO singleton, e é disso que o snapshot vive. */
	async create(): Promise<PGliteDriver> {
		return this
	}

	async reset(): Promise<void> {
		await truncateAllTables(this.db)
	}

	async runMigrations(): Promise<void> {
		// ESTA INSTÂNCIA JÁ MIGROU — e como `lifetime = 'process'` a torna singleton, "esta instância"
		// quer dizer "este processo". A guarda abaixo cobre apenas o caso de subir DO snapshot; quando
		// a instância já estava materializada, `alreadyMaterialised` é true, a guarda é pulada, e o
		// journal era repetido por cima de tabelas existentes. Aparecia na SEGUNDA suíte a compor a
		// família pg — `relation "authentication_accounts" already exists` —, o que fazia o `beforeAll`
		// estourar e cada caso do arquivo falhar por um `testBed` que nunca chegou a existir.
		if (this.migrated) return

		const alreadyMaterialised = this.materialised !== null
		const materialised = this.materialise(true)

		// Subiu DO snapshot: o schema já está lá, exatamente como o journal o deixou. Repetir por cima
		// falharia no primeiro `CREATE TABLE` de qualquer forma.
		if (!alreadyMaterialised && snapshot !== null) {
			this.migrated = true
			return
		}

		for (const entry of await readCloudJournal(this.migrationsDir)) {
			await materialised.pg.exec(await readFile(path.join(this.migrationsDir, `${entry.tag}.sql`), 'utf-8'))
		}
		migratedCount++
		this.migrated = true

		// Dump ANTES de qualquer teste escrever uma linha, para o snapshot ser o estado pós-migração
		// VAZIO — que é o que torna `reset()` (truncate-all) equivalente numa instância vinda dele.
		if (snapshot === null) snapshot = await materialised.pg.dumpDataDir('none')
	}

	async readMigrations(): Promise<MigrationStatus> {
		const tags = (await readCloudJournal(this.migrationsDir)).map(entry => entry.tag)
		return this.migrated ? { applied: tags, pending: [] } : { applied: [], pending: tags }
	}

	/** No-op POR CONTRATO — `lifetime = 'process'`. Ver o eixo em `DatabaseDriver`. */
	async close(): Promise<void> {
		// Vazio de propósito, e a razão mora AQUI dentro para que quem lê o corpo a encontre: o
		// substrato é um Postgres em processo cujo tempo de vida é o do PROCESSO, não o da conexão.
		// Fechá-lo aqui derrubaria o banco para todas as suítes que ainda vão rodar.
	}
}
