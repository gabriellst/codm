import { beforeAll, describe, expect, it } from 'bun:test'
import { sql } from 'drizzle-orm'
import { owners } from '@codm/contracts/db/pg'
import { OwnerKind } from '@codm/contracts-typescript/wire/enums'
import { PGliteDriver } from './PGliteDriver'

/**
 * O tronco cloud, aplicado num Postgres DE VERDADE — em processo.
 *
 * É a prova que nenhuma leitura de schema dá: o `drizzle-kit generate` emitir SQL não significa que
 * o SQL roda. Aqui as 13 tabelas do ADR 0005 são criadas por um Postgres real, com os CHECKs, os
 * índices parciais e as chaves estrangeiras que o dialeto exige — e uma escrita atravessa.
 *
 * Sem este arquivo, a família `pg` seria código que compila. Compilar não é rodar.
 */
describe('PGliteDriver — o tronco cloud roda num Postgres real', () => {
	const driver = new PGliteDriver()

	beforeAll(async () => {
		await driver.runMigrations()
	})

	it('PGL-01: as 13 tabelas do tronco cloud existem, CADA UMA sob seu schema (T1.9)', async () => {
		// Este teste é o que prova que a T1.9 chegou até o banco. Antes ele consultava
		// `schemaname = 'public'` e casava nomes achatados — depois da conversão, `public` ficou VAZIO
		// e ele foi o primeiro a acusar. Agora ele pergunta ao catálogo do Postgres quem é o dono de
		// cada tabela, que é a pergunta que só faz sentido quando o namespace é nativo.
		const rows = await driver.db.execute<{ schemaname: string; tablename: string }>(
			sql`SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('authentication', 'owner', 'shared') ORDER BY schemaname, tablename`,
		)
		const tables = rows.rows.map(row => `${row.schemaname}.${row.tablename}`)

		// Derivado do ADR 0005: auth (7) + owner (2) + kernel (4).
		expect(tables).toHaveLength(13)
		expect(tables).toContain('authentication.users')
		expect(tables).toContain('owner.owners')
		expect(tables).toContain('shared.outbox')

		// A contraprova de FORMA: nada nosso sobrou em `public`. Sem esta linha o teste acima passaria
		// igual num banco que tivesse as 13 nos schemas E as 13 antigas achatadas ao lado.
		const publicRows = await driver.db.execute<{ tablename: string }>(
			sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
		)
		expect(
			publicRows.rows.map(row => row.tablename),
			'nenhuma tabela do tronco pode ficar em `public` — o namespace é o schema, não um pedaço do nome',
		).toEqual([])

		// E a contraprova de ESCOPO, que sobrevive à mudança de forma: contexto local não existe no
		// Postgres, e agora nem o schema dele existe.
		const schemas = await driver.db.execute<{ nspname: string }>(sql`SELECT nspname FROM pg_namespace`)
		const names = schemas.rows.map(row => row.nspname)
		expect(names, 'um contexto LOCAL com schema no tronco cloud é schema que ninguém escreve').not.toContain('workspace')
		expect(names).not.toContain('thread')
	})

	it('PGL-02: o CHECK de enum é DB-enforced — o dialeto aceitou a restrição', async () => {
		// `await` explícito, e não `.rejects`: o builder do drizzle é um THENABLE, não uma Promise, e
		// `expect(builder).rejects` inspeciona o objeto em vez de executar a consulta — o teste passaria
		// sem nunca ter falado com o banco. Foi o que aconteceu na primeira escrita deste arquivo.
		//
		// `created_at`/`updated_at` vão EXPLÍCITOS, e a razão é um defeito que a primeira versão deste
		// teste tinha: os defaults dessas colunas são da APLICAÇÃO (`$defaultFn`, decisão do ADR 0005
		// para os dois troncos escreverem pela mesma origem), não do banco. Um INSERT cru sem elas morre
		// no NOT NULL antes de o CHECK ser alcançado — e o teste passaria provando "a consulta falhou",
		// não "falhou PELO CHECK". Foi a asserção sobre o NOME da restrição que expôs isso.
		let raised: unknown
		try {
			await driver.db.execute(
				sql`INSERT INTO "owner"."owners" (id, name, kind, responsible_user_id, created_at, updated_at) VALUES ('w1', 'Witness', 'NOT_A_KIND', 'u1', now(), now())`,
			)
		} catch (error) {
			raised = error
		}

		expect(raised, 'sem o CHECK, `text` aceitaria qualquer string e o enum de fio seria decorativo').toBeDefined()
		// O drizzle EMBRULHA o erro do driver e o texto de fora só repete a consulta — o nome da
		// restrição viola vem no `cause`. Asserir só sobre a mensagem externa provaria "a consulta
		// falhou", não "falhou PELO CHECK", e qualquer erro de digitação no SQL passaria por essa porta.
		expect(String((raised as Error).cause)).toContain('owner_owners_kind_check')
	})

	it('PGL-03: uma escrita real atravessa, e volta pelo cliente tipado', async () => {
		await driver.db.insert(owners).values({ id: 'w2', name: 'Witness', kind: OwnerKind.INDIVIDUAL, responsibleUserId: 'u1' })

		const found = await driver.db.select().from(owners)
		expect(found).toHaveLength(1)
		expect(found[0]?.name).toBe('Witness')
		// `$defaultFn` da aplicação, não `defaultNow()` do banco — a decisão que mantém os dois troncos
		// escrevendo o mesmo valor pela mesma origem (ADR 0005).
		expect(found[0]?.createdAt).toBeInstanceOf(Date)
	})

	it('PGL-04: `readMigrations` diz APLICADO depois de migrar', async () => {
		const status = await driver.readMigrations()
		expect(status.pending).toEqual([])
		expect(status.applied.length).toBeGreaterThan(0)
	})

	it('PGL-05: `lifetime` é `process` — e `close()` é no-op POR CONTRATO', async () => {
		expect(driver.lifetime).toBe('process')
		await driver.close()
		// Se `close()` tivesse derrubado algo, esta consulta morreria. O eixo do `DatabaseDriver` promete
		// que não — é o que permite reaproveitar a instância (e o snapshot) entre suítes.
		const alive = await driver.db.execute<{ ok: number }>(sql`SELECT 1 AS ok`)
		expect(alive.rows[0]?.ok).toBe(1)
	})
})
