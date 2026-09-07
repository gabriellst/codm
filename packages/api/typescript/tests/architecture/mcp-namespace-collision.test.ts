import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * RAIL — nenhum `operationId` nosso pode conter `__`.
 *
 * `withUpstream` registra uma ferramenta de terceiro como `<key>__<tool>` e intercepta o
 * `tools/call` por esse nome ANTES do servidor gerado. O separador é o que mantém os dois espaços
 * apartados: enquanto nenhum operationId nosso tiver `__`, nenhuma ferramenta de terceiro pode
 * sombrear uma nossa, e a decisão 10 do spec ("o `wire.ts` nunca muda") continua verdadeira.
 *
 * Medido em 2026-09-03: 0 de 65 operationIds contêm `__` — é uma propriedade REAL do sistema hoje,
 * e é exatamente por isso que ela merece um rail em vez de um comentário. O sombreamento fica
 * inalcançável até o dia em que alguém nomear um controller com `__` e descobrir pelo caminho mais
 * caro: uma ferramenta NOSSA deixando de ser chamada, em silêncio, porque um servidor de terceiro
 * reivindicou o nome dela.
 */
const OPENAPI = join(import.meta.dir, '..', '..', 'public', 'docs', 'openapi.json')

interface OpenApiSpec {
	paths: Record<string, Record<string, { operationId?: string }>>
}

function operationIds(): string[] {
	const spec = JSON.parse(readFileSync(OPENAPI, 'utf8')) as OpenApiSpec
	return Object.values(spec.paths)
		.flatMap(methods => Object.values(methods))
		.map(operation => operation.operationId)
		.filter((id): id is string => typeof id === 'string')
}

describe('rail — o separador de namespace do MCP', () => {
	it('nenhum operationId contém `__`, que é o que impede uma ferramenta de terceiro de sombrear a nossa', () => {
		expect(operationIds().filter(id => id.includes('__'))).toEqual([])
	})

	it('a varredura vê os operationIds que existem — a rail não pode passar por varrer o vazio', () => {
		expect(operationIds().length).toBeGreaterThan(50)
	})
})
