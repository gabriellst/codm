// O ciclo de vida do kernel (spec DC0, ACs 1-6). O que se prova aqui é a MECÂNICA de ligar e
// desligar — não a composição: os contextos são mínimos, sem controllers, sem registry, sem jobs.
//
// As duas assimetrias são o ponto, e cada uma tem falseador próprio: ligar FALHA RÁPIDO (o
// contexto seguinte não roda), desligar DRENA TUDO (a falha de um não impede o outro).
import { describe, expect, it } from 'bun:test'
import { BoundedContext, type ShutdownFailure } from './BoundedContext'

const make = (name: string, hooks: { start?: () => void; shutdown?: () => void } = {}) =>
	BoundedContext.create({
		name,
		controllers: {},
		start: hooks.start ? async () => hooks.start?.() : undefined,
		shutdown: hooks.shutdown ? async () => hooks.shutdown?.() : undefined,
	})

describe('BoundedContext — ciclo de vida', () => {
	it('AC-6: contexto sem hooks passa por startAll/shutdownAll como no-op', async () => {
		const ctx = await make('sem-hooks')

		await BoundedContext.startAll([ctx])

		expect(await BoundedContext.shutdownAll([ctx])).toEqual([])
	})

	it('AC-3 / F-1: startAll FALHA RÁPIDO — o contexto seguinte NÃO roda', async () => {
		let seguinte = 0
		const quebrado = await make('quebrado', {
			start: () => {
				throw new Error('pump quebrado')
			},
		})
		const depois = await make('depois', { start: () => void seguinte++ })

		await expect(BoundedContext.startAll([quebrado, depois])).rejects.toThrow(/quebrado/)

		// A TESTEMUNHA: o contador do seguinte ficou em 0. Sem o `throw` no catch, seria 1.
		expect(seguinte).toBe(0)
	})

	it('AC-4 / F-2: shutdownAll DRENA TUDO — isola a falha e devolve a lista', async () => {
		let drenado = 0
		const quebrado = await make('quebrado', {
			shutdown: () => {
				throw new Error('recurso preso')
			},
		})
		const outro = await make('outro', { shutdown: () => void drenado++ })

		const failures: ShutdownFailure[] = await BoundedContext.shutdownAll([quebrado, outro])

		expect(failures).toHaveLength(1)
		expect(failures[0]?.context).toBe('quebrado')
		// A TESTEMUNHA: o outro drenou mesmo com o vizinho falhando.
		expect(drenado).toBe(1)
	})

	it('AC-4: shutdownAll drena em LIFO — o inverso da ordem de composição', async () => {
		const ordem: string[] = []
		const primeiro = await make('primeiro', { shutdown: () => void ordem.push('primeiro') })
		const segundo = await make('segundo', { shutdown: () => void ordem.push('segundo') })

		await BoundedContext.shutdownAll([primeiro, segundo])

		expect(ordem).toEqual(['segundo', 'primeiro'])
	})

	it('AC-5 / F-3: start() é idempotente — o hook roda uma vez só', async () => {
		let vezes = 0
		const ctx = await make('idempotente', { start: () => void vezes++ })

		await ctx.start()
		await ctx.start()

		expect(vezes).toBe(1)
	})
})
