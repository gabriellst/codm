import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { TestBed, givenIssue, givenThread } from '@test/support'
import { IssueStatus, StopKind } from '@codm/contracts-typescript/wire/enums'
import { ThreadStopRaisedEvent } from '@codm/contracts-typescript/wire/events'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { RecordStopFromExecution } from '@thread/handlers/RecordStopFromExecution'
import { MarkIssueNeedsInputFromStop } from '@issue/handlers/MarkIssueNeedsInputFromStop'
import { ReconcileStalledIssues } from '@agent/usecases/ReconcileStalledIssues'
import { SteerIssueTurn } from '@agent/usecases/SteerIssueTurn'

/**
 * FLOW (integration DI) — o ciclo que a spec de 2026-08-26 fecha: um turno acaba sem declarar nada →
 * a varredura vê a issue sem trabalho em voo e emite o stop inferido → o outbox entrega o fato, o
 * `thread` grava a LINHA do stop e o `issue` move o STATUS → um steer devolve a issue ao trabalho.
 *
 * Modo `integration`, e não `mock` como os outros flows: o AC-14 pede a linha do stop GRAVADA na
 * tabela, e o modo mock não tem tabela. Isto é o que torna o teste sensível ao bug que originou a
 * spec — em 26/08 dois `thread.stop_raised` foram publicados e processados sem erro e nenhuma linha
 * apareceu em `stops`.
 */
describe('Flow (integration): turno sem declaração → NEEDS_INPUT → steer → WORKING', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('closes the loop end to end', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		const issues = testBed.resolve(IssueRepository)

		// 1. Nada em voo: o turno acabou e ninguém declarou. A varredura enxerga a órfã.
		const { stalledIssueIds } = await testBed.resolve(ReconcileStalledIssues).execute({})
		expect(stalledIssueIds).toEqual([issue.id.value])

		// 2. O fato entregue aos DOIS consumidores, encadeado explicitamente — o padrão que
		// `stop-control-plane.flow.test.ts` já usa. No modo `integration` não há dispatcher a drenar: o
		// TestBed só substitui o OutboxDispatcher no modo `mock`.
		const stopId = uuidv7()
		const fact = new ThreadStopRaisedEvent({
			ownerId: issue.ownerId,
			payload: {
				stopId,
				issueId: issue.id.value,
				threadId: thread.id.value,
				kind: StopKind.HUMAN_REQUESTED,
				detail: ReconcileStalledIssues.DETAIL,
			},
		})
		await testBed.resolve(RecordStopFromExecution).handle(fact as never)
		await testBed.resolve(MarkIssueNeedsInputFromStop).handle(fact as never)

		// 2a. O `issue` moveu o STATUS, com o motivo legível.
		const stalled = await issues.findById(issue.id.value)
		expect(stalled?.status).toBe(IssueStatus.NEEDS_INPUT)
		expect(stalled?.meta).toBe(ReconcileStalledIssues.DETAIL)

		// 2b. O `thread` gravou a LINHA do stop — a metade que sumia em silêncio em 26/08.
		const stops = await testBed.resolve(ThreadRepository).openStopsByIssue(issue.id.value)
		expect(stops).toHaveLength(1)
		expect(stops[0]?.kind).toBe(StopKind.HUMAN_REQUESTED)
		expect(stops[0]?.stopId).toBe(stopId)

		// 3. Uma segunda varredura não emite nada: a issue não está mais WORKING.
		const second = await testBed.resolve(ReconcileStalledIssues).execute({})
		expect(second.stalledIssueIds).toEqual([])

		// 4. O operador responde. O steer reabre a issue parada e enfileira o turno.
		await testBed.resolve(SteerIssueTurn).execute({
			ownerId: issue.ownerId,
			threadId: thread.id.value,
			issueId: issue.id.value,
			text: 'roda a spec destacada e me diz o veredito',
		})

		const reopened = await issues.findById(issue.id.value)
		expect(reopened?.status).toBe(IssueStatus.WORKING)

		// 5. E com trabalho em voo de novo (o steer enfileirou um item), a varredura não a toca.
		const third = await testBed.resolve(ReconcileStalledIssues).execute({})
		expect(third.stalledIssueIds).toEqual([])
	})
})
