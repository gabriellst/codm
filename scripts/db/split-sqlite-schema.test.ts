/**
 * TESTEMUNHA do corte core/produto.
 *
 * `split-sqlite-schema.ts` introduziu uma regra nova: uma tabela é do kernel se o nome começa com
 * `shared_`. Regra nova sem testemunha é afirmação, não gate — e o modo de falhar aqui é silencioso
 * e caro: um corte errado emite um schema que parece válido, o sqlc gera models a partir dele, e o
 * defeito só aparece quando alguém usa a tabela que sumiu.
 *
 * O caso que mais importa é o ÚLTIMO: `assertNoCrossReference` existe para que a regra do prefixo
 * seja falseável. Se um dia uma FK cruzar a fronteira, o script tem de REPROVAR nomeando os dois
 * lados, em vez de emitir SQL quebrado — porque nesse momento o prefixo deixou de descrever o
 * schema, e a resposta certa é redesenhar o corte, não contorná-lo.
 */
import { describe, expect, it } from 'bun:test'
import { assertNoCrossReference, derive, splitStatements } from './split-sqlite-schema'

const CORE_TABLE = `CREATE TABLE "shared_outbox" (\n\t"id" text PRIMARY KEY NOT NULL\n);`
const APP_TABLE = `CREATE TABLE "owner_owners" (\n\t"id" text PRIMARY KEY NOT NULL\n);`
const APP_INDEX = `CREATE INDEX "owner_idx" ON "owner_owners" ("id");`

describe('split-sqlite-schema — o corte pelo prefixo shared_', () => {
	it('manda cada CREATE TABLE para o seu lado', () => {
		const { core, app } = derive([CORE_TABLE, APP_TABLE].join('\n'))
		expect(core).toContain('shared_outbox')
		expect(core).not.toContain('owner_owners')
		expect(app).toContain('owner_owners')
		expect(app).not.toContain('shared_outbox')
	})

	it('leva o índice junto da tabela que ele indexa', () => {
		const { core, app } = derive([CORE_TABLE, APP_TABLE, APP_INDEX].join('\n'))
		expect(app).toContain('owner_idx')
		expect(core).not.toContain('owner_idx')
	})

	it('os dois lados carregam o cabeçalho que proíbe edição à mão', () => {
		const { core, app } = derive(`${CORE_TABLE}\n${APP_TABLE}`)
		for (const side of [core, app]) expect(side).toContain('DERIVADO — não edite à mão')
	})

	it('reconhece table e index, e ignora o que não é nem um nem outro', () => {
		const statements = splitStatements(`${CORE_TABLE}\n${APP_INDEX}\nPRAGMA foreign_keys = ON;`)
		expect(statements.map(s => s.table)).toEqual(['shared_outbox', 'owner_owners', null])
	})

	it('TESTEMUNHA: uma FK cruzando a fronteira REPROVA, nomeando os dois lados', () => {
		const crossing = `CREATE TABLE "shared_outbox" (\n\t"owner_id" text NOT NULL,\n\tFOREIGN KEY ("owner_id") REFERENCES "owner_owners"("id")\n);`
		expect(() => derive(crossing)).toThrow(/corte inválido: "shared_outbox" referencia "owner_owners"/)
	})

	it('uma FK dentro do mesmo lado passa — o guard mira a fronteira, não FKs em geral', () => {
		const sameSide = `CREATE TABLE "owner_onboardings" (\n\t"owner_id" text NOT NULL,\n\tFOREIGN KEY ("owner_id") REFERENCES "owner_owners"("id")\n);`
		expect(() => assertNoCrossReference(splitStatements(sameSide))).not.toThrow()
	})
})
