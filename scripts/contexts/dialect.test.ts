// O resolvedor de dialeto (DC4 T1.8).
//
// O falseador que o goal nomeia é o CRUZADO: alimentar o leitor de um dialeto com o schema do outro
// tem de reprovar. E ele reprova por CONSTRUÇÃO, não por um `if` — cada leitor casa a sintaxe do seu
// próprio dialeto e só dela.
//
// O último caso é o mais importante: ele mede o TRONCO CLOUD REAL e prova, com número, que ele está
// na forma errada — 13 tabelas em `pgTable(` plano, zero namespace nativo.
import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DIALECTS, namespaceAllowsPrefixForm, pgNamespace, sqliteNamespace } from '../../packages/contracts/src/db/dialect'

const CLOUD = join(import.meta.dir, '../../packages/contracts/src/db/pg/schema')
const LOCAL = join(import.meta.dir, '../../packages/contracts/src/db/sqlite')

const readSchemas = (dir: string) =>
	readdirSync(dir)
		.filter(f => f.endsWith('.ts') && f !== 'index.ts' && !f.startsWith('_'))
		.map(f => readFileSync(join(dir, f), 'utf8'))
		.join('\n')

// A forma ALVO do pg: namespace nativo. Não existe no repo hoje — é o que a T1.9 vai instaurar.
const PG_ALVO = `
export const authSchema = pgSchema('authentication')
export const users = authSchema.table('users', {})
export const accounts = authSchema.table('accounts', {})
`

describe('DialectNamespace — o namespace lógico vira tabela física', () => {
	it('DIA-01: `pg` usa namespace NATIVO; `sqlite` usa prefixo, por concessão do dialeto', () => {
		expect(pgNamespace.declare('authentication', 'users')).toEqual({ form: 'schema', schema: 'authentication', name: 'users' })
		expect(sqliteNamespace.declare('authentication', 'users')).toEqual({ form: 'prefix', name: 'authentication_users' })
	})

	it('DIA-02: o leitor pg resolve dono a partir da VARIÁVEL de schema, em dois passos', () => {
		const owners = pgNamespace.tableOwners(PG_ALVO)

		expect(owners.get('users')).toBe('authentication')
		expect(owners.get('accounts')).toBe('authentication')
	})

	it('DIA-03: o leitor sqlite resolve dono pelo prefixo do literal', () => {
		const owners = sqliteNamespace.tableOwners("export const events = sqliteTable('shared_events', {})")

		expect(owners.get('events')).toBe('shared')
	})

	it('DIA-04 / FALSEADOR CRUZADO: cada leitor RECUSA o dialeto do outro — mapa vazio', () => {
		// pg alimentado com sqlite: não há `pgSchema(` nem `<var>.table(`.
		expect(pgNamespace.tableOwners("export const events = sqliteTable('shared_events', {})").size).toBe(0)
		// sqlite alimentado com pg: não há `sqliteTable(`.
		expect(sqliteNamespace.tableOwners(PG_ALVO).size).toBe(0)
	})

	it('DIA-05: a forma de prefixo impõe uma regra que era acordo tácito — namespace sem underscore', () => {
		expect(namespaceAllowsPrefixForm('authentication')).toBe(true)
		// Um namespace com `_` tornaria "o trecho antes do primeiro _" ambíguo, e o dono sairia errado
		// em silêncio. Enquanto isso vivia numa regex dentro de um rail, ninguém tinha onde ler.
		expect(namespaceAllowsPrefixForm('agent_runs')).toBe(false)
	})

	it('DIA-06: o TRONCO LOCAL está na forma certa — o sqlite não tem alternativa', () => {
		const owners = sqliteNamespace.tableOwners(readSchemas(LOCAL))

		expect(owners.size, 'o tronco local declara tabelas via sqliteTable').toBeGreaterThan(0)
		expect(owners.get('events')).toBe('shared')
	})

	it('DIA-07: o TRONCO CLOUD está na forma CERTA — namespace nativo nas 13 tabelas (T1.9)', () => {
		const source = readSchemas(CLOUD)
		const owners = pgNamespace.tableOwners(source)

		// Esta asserção nasceu invertida, e a inversão é o registro da reforma. Ela media o DEFEITO —
		// `zero namespaces nativos no tronco pg` — porque era esse o estado quando o resolvedor foi
		// escrito. A T1.9 converteu as 13 tabelas, e no mesmo commit em que o tronco mudou de forma
		// esta linha teve de mudar de sinal. Um rail que mede um defeito é um rail com prazo: ou o
		// defeito é corrigido e ele vira guarda, ou ele fica verde para sempre descrevendo a doença.
		expect(owners.size, 'as 13 tabelas do tronco cloud, cada uma sob seu schema').toBe(13)
		expect(source).toContain('pgSchema(')
		// Sobre a DECLARAÇÃO, não sobre o arquivo: os docblocks citam `pgTable('authentication_users')`
		// de propósito, para dizer o que a T1.9 aposentou. É a mesma lição do CTX-04 — uma asserção de
		// ausência sobre o texto inteiro acaba medindo a prosa que explica a ausência.
		expect(source, 'nenhuma tabela do tronco cloud pode ser declarada em `pgTable(` plano').not.toMatch(/export const \w+ = pgTable\(/)

		// E os donos são os certos — tamanho sozinho não distingue 13 tabelas bem alocadas de 13
		// tabelas todas no mesmo schema errado.
		expect(owners.get('users')).toBe('authentication')
		expect(owners.get('owners')).toBe('owner')
		expect(owners.get('events')).toBe('shared')
		expect(new Set(owners.values())).toEqual(new Set(['authentication', 'owner', 'shared']))
	})

	it('DIA-08: os dois dialetos estão no registro, e cada um sabe seu id', () => {
		expect(Object.keys(DIALECTS).sort()).toEqual(['pg', 'sqlite'])
		expect(DIALECTS.pg.id).toBe('pg')
		expect(DIALECTS.sqlite.id).toBe('sqlite')
	})
})
