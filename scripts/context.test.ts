import { describe, expect, it } from 'bun:test'
import { CONTEXT_MAP, CONTEXTS, TABLE_READ_EDGES } from '../packages/api/typescript/generated/contexts.generated'
import { viewOf } from './context'

/**
 * A introspecção (T1.10) — e o que estes testes cobram dela.
 *
 * Uma ferramenta de leitura tem um modo de falha próprio e traiçoeiro: mostrar algo plausível que
 * não corresponde ao repo. Ninguém percebe, porque quem consulta a ferramenta está justamente sem
 * saber a resposta. Então cada asserção aqui compara a visão contra a TABELA que a origina, e
 * nenhuma delas escreve à mão o que espera ver.
 *
 * A metade que mais importa é a ARESTA INVERSA. `consumes` e `reads` só reorganizam o que as
 * tabelas já dizem; `consumedBy` e `readBy` são a direção que NENHUMA tabela declara, e é a que
 * responde a pergunta cara — "o que quebra se eu mexer aqui?".
 */
describe('bun context show / map — a introspecção lê o repo, não uma cópia dele', () => {
	it('CTXV-01: os pontos de montagem saem da PLACEMENT — `shared` é o único dual', () => {
		const dual = Object.keys(CONTEXTS).filter(id => viewOf(id as never).mounts.length > 1)

		expect(dual, 'a PLACEMENT declara `shared` como o único contexto dual (ADR 0002)').toEqual(['shared'])
		expect(viewOf('shared').mounts.map(m => `${m.deployment}:${m.infra.db}`)).toEqual(['cloud:pg', 'local:libsql'])
	})

	it('CTXV-02: a ARESTA INVERSA é derivada — quem me consome não está declarado em lugar nenhum', () => {
		// `CONTEXT_MAP.owner.auth` existe; portanto `auth` tem de saber que `owner` depende dele, sem
		// que ninguém tenha escrito isso do lado do `auth`.
		expect(CONTEXT_MAP.owner?.auth, 'a pré-condição do teste — se esta aresta sumir, ele não mede mais nada').toBeDefined()
		expect(viewOf('auth').consumedBy.map(e => e.context)).toContain('owner')

		// E a simetria vale para TODA aresta, não só para o exemplo: quem aparece no `consumes` de A
		// tem de ter A no seu `consumedBy`.
		for (const [consumidor, arestas] of Object.entries(CONTEXT_MAP)) {
			for (const alvo of Object.keys(arestas ?? {})) {
				expect(
					viewOf(alvo as never).consumedBy.map(e => e.context),
					`${alvo} deveria saber que ${consumidor} o consome`,
				).toContain(consumidor)
			}
		}
	})

	it('CTXV-03: `readBy` casa por NAMESPACE, não por nome de contexto', () => {
		// A distinção que o plano insiste em separar: `consumes` é acoplamento de MÓDULO, `reads` é
		// acoplamento de TABELA, e as duas têm uniões de chave diferentes. Casar `readBy` pelo id do
		// contexto em vez do namespace funcionaria por acidente hoje (quase todo contexto tem
		// namespace homônimo) e quebraria em `auth`, cujo namespace é `authentication`.
		const leitoresDeAuth = TABLE_READ_EDGES.filter(edge => edge.schema === 'authentication').map(edge => edge.consumer)

		expect(viewOf('auth').namespace, 'o caso que separa id de namespace').toBe('authentication')
		expect(
			viewOf('auth')
				.readBy.map(e => e.context)
				.sort(),
		).toEqual([...leitoresDeAuth].sort())
	})

	it('CTXV-04: um contexto sem persistência não inventa namespace nem leitores', () => {
		const ui = viewOf('ui')

		expect(ui.namespace, '`ui` é BFF — declara `null`, e dizer null é diferente de esquecer').toBeNull()
		expect(ui.namespaceOwner).toBeNull()
		expect(ui.readBy, 'sem namespace não há tabela para alguém ler').toEqual([])
		// Mas ele LÊ os outros, e bastante — a assimetria é o ponto de um BFF.
		expect(ui.reads.length).toBeGreaterThan(0)
	})

	it('CTXV-05: TODO contexto declarado tem visão, e nenhuma visão é de contexto inexistente', () => {
		const ids = Object.keys(CONTEXTS)

		for (const id of ids) expect(viewOf(id as never).id, `visão de ${id}`).toBe(id)
		// A contraprova: nenhum consumidor citado existe fora do conjunto declarado.
		for (const id of ids) {
			for (const aresta of viewOf(id as never).consumedBy) expect(ids).toContain(aresta.context)
			for (const aresta of viewOf(id as never).readBy) expect(ids).toContain(aresta.context)
		}
	})
})
