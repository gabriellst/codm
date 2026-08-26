import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ProductConfig } from '@shared/config/ProductConfig'
import { REPO } from '../../../../../../template.config'

/**
 * O NOME DO ARQUIVO DE STORE, PINADO ENTRE AS DUAS LINGUAGENS (F3/T8).
 *
 * ── O DEFEITO ────────────────────────────────────────────────────────────────────────────────────
 * O daemon TS e o gateway Go abrem o MESMO arquivo SQLite dentro do mesmo `CODM_DATA_DIR`. O nome
 * dele estava literalizado em dez lugares, dois deles em linguagens diferentes — e os comentários
 * dos dois admitiam, por escrito, serem espelhos um do outro. Um rebrand pela metade deixava o TS
 * abrindo `novo.db` e o Go abrindo `codm.db`, no mesmo diretório, SEM ERRO em nenhum dos lados: dois
 * bancos, cada processo achando que era o único, e o "co-tenant sobre um arquivo" virando ficção.
 *
 * ── A CURA, E O QUE ELA DEIXA DE FORA ────────────────────────────────────────────────────────────
 * O nome virou env de PRODUTO (`CODM_DB_FILE_NAME`, declarada em `template.config.ts` REPO.env com
 * `consumers: ['apiTs', 'apiGo']`). Env e não constante de manifesto porque o Go não importa aquele
 * arquivo — o Dockerfile nem o copia —, mas os dois runtimes leem env nativamente. Setá-la uma vez
 * no `.env` move os dois juntos, e um rebrand deixa de exigir edição de código.
 *
 * O que a env NÃO cobre é quem nunca a define: aí cada lado usa o próprio fallback, e os dois
 * fallbacks são espelhos de novo. Este rail existe exatamente para esse resíduo — e a T7 desta mesma
 * frente já provou, com evidência, que espelho sem rail não se mantém (achou `CODM` de um lado e
 * `CoDM` do outro, divergidos por um codemod anterior).
 */
describe('o nome do arquivo de store é UM, nas duas linguagens', () => {
	const goStore = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../go/core/db/sqlite/store.go')

	/** O fallback do Go, lido da fonte — não redigitado aqui, que seria a terceira cópia. */
	function goFallback(): string {
		const source = readFileSync(goStore, 'utf8')
		const match = source.match(/defaultDBFileName\s*=\s*"([^"]+)"/)
		if (match === null) throw new Error('store.go deixou de declarar `defaultDBFileName` — reveja este rail')
		return match[1] ?? ''
	}

	/** A chave de env que o Go lê, também da fonte. */
	function goEnvKey(): string {
		const source = readFileSync(goStore, 'utf8')
		const match = source.match(/dbFileNameEnv\s*=\s*"([^"]+)"/)
		if (match === null) throw new Error('store.go deixou de declarar `dbFileNameEnv` — reveja este rail')
		return match[1] ?? ''
	}

	test('DBF-01: os dois fallbacks são byte-idênticos', () => {
		// A asserção que impede o "dois bancos". Se alguém rebatizar um lado e esquecer o outro, esta
		// linha fica vermelha ANTES de um operador descobrir que metade dos seus dados sumiu.
		expect(goFallback(), 'o fallback do Go bate com o do ProductConfig').toBe(ProductConfig.env.CODM_DB_FILE_NAME)
	})

	test('DBF-02: as duas linguagens leem a MESMA chave de env', () => {
		// Fallbacks iguais não bastam: se os dois lados lessem chaves diferentes, setar a env moveria
		// só um deles — e o resultado seria o mesmo "dois bancos", agora disparado por configuração
		// em vez de por rebrand.
		expect(goEnvKey(), 'a chave que o Go lê').toBe('CODM_DB_FILE_NAME')
		expect(Object.keys(REPO.env), 'e ela é DECLARADA no manifesto').toContain('CODM_DB_FILE_NAME')
	})

	test('DBF-03: o manifesto declara os DOIS consumidores', () => {
		// A declaração é o que faz o `.env.example` gerado nomear os dois lados. Um consumidor omitido
		// não quebra nada hoje e mente na documentação amanhã.
		const decl = REPO.env.CODM_DB_FILE_NAME as { consumers: readonly string[]; schema: string }
		expect([...decl.consumers].sort()).toEqual(['apiGo', 'apiTs'])
		expect(decl.schema, 'é env de PRODUTO, não do kernel — o core portável não sabe o nome do banco deste produto').toBe('product')
	})

	test('DBF-04: nenhum outro site redigita o nome', () => {
		// A prova de que os dez viraram um. Varre os arquivos que carregavam o literal e cobra que
		// nenhum ainda o contenha — se um voltar por cópia-e-cola, esta linha o pega.
		const api = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
		const sites = [
			'src/shared/db/FileLibsqlDriver.ts',
			'scripts/migrate.ts',
			'scripts/apply-migrations-once.ts',
			'scripts/smoke-shared-store.ts',
			'scripts/dump-sqlite-schema.ts',
			'tests/kernel/concurrent-boot.test.ts',
			'tests/flows/shared-outbox-lanes.test.ts',
			'tests/flows/ts-integration-lane.flow.test.ts',
		]
		const offenders = sites.filter(site => readFileSync(join(api, site), 'utf8').includes(`'${ProductConfig.env.CODM_DB_FILE_NAME}'`))
		expect(offenders, 'estes voltaram a redigitar o nome em vez de ler a env').toEqual([])
	})
})
