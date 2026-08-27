import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { TestBed, givenIssue, givenThread, givenDomainEvent } from '@test/support'
import { IssueStatus, MailboxItemKind, MailboxTargetKind, StopKind } from '@codm/contracts-typescript/wire/enums'
import { ThreadStopRaisedEvent } from '@codm/contracts-typescript/wire/events'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { IssueArchiveReason } from '@codm/contracts-typescript/wire/enums'
import { MarkIssueNeedsInputFromStop } from '@issue/handlers/MarkIssueNeedsInputFromStop'
import { MailboxRepository } from '../repositories/MailboxRepository'
import { AgentRunCompletedEvent } from '../events/AgentRunCompletedEvent'
import { FactSource } from '../enums'
import { ReconcileStalledIssues } from './ReconcileStalledIssues'

describe('ReconcileStalledIssues', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let usecase: ReconcileStalledIssues

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		usecase = testBed.resolve(ReconcileStalledIssues)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function enqueueSteer(ownerId: string, issueId: string, threadId: string): Promise<void> {
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind: MailboxItemKind.STEER,
			payload: { issueId, threadId, key: 'k', title: 't', text: 'segue' },
			dedupKey: uuidv7(),
		})
	}

	it('marks a WORKING issue with both queues empty as stalled', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })

		const { stalledIssueIds } = await usecase.execute({})

		expect(stalledIssueIds).toEqual([issue.id.value])
	})

	it('does NOT touch an issue with a mailbox item still in flight', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		await enqueueSteer(issue.ownerId, issue.id.value, thread.id.value)

		const { stalledIssueIds } = await usecase.execute({})

		expect(stalledIssueIds).toEqual([])
	})

	it('does NOT touch an issue whose outbox event is not processed yet', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		// Um fato recém-gravado e ainda não despachado — a janela em que um turno acabou de declarar
		// COMPLETED e o materializador ainda não rodou. Marcar aqui seria o falso positivo que o segundo
		// predicado existe para impedir. `givenDomainEvent` grava pelo `DomainEventRepository`, que é
		// exatamente o caminho que deixa a linha em `shared_outbox` com `processed_at IS NULL`.
		await givenDomainEvent(
			testBed,
			new AgentRunCompletedEvent({
				entityId: issue.id.value,
				ownerId: issue.ownerId,
				payload: {
					issueId: issue.id.value,
					threadId: thread.id.value,
					key: issue.key,
					completedAt: new Date(),
					source: FactSource.DECLARED,
				},
			}),
		)

		const { stalledIssueIds } = await usecase.execute({})

		expect(stalledIssueIds).toEqual([])
	})

	it('does NOT touch archived issues nor issues outside WORKING', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issues = testBed.resolve(IssueRepository)

		const archived = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		archived.archive(IssueArchiveReason.MANUAL)
		await issues.save(archived)

		const completed = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'other' })
		completed.complete('entregue')
		await issues.save(completed)

		const { stalledIssueIds } = await usecase.execute({})

		expect(stalledIssueIds).toEqual([])
	})

	it('running twice does not raise a second stop for the same issue', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })

		const first = await usecase.execute({})
		expect(first.stalledIssueIds).toEqual([issue.id.value])

		// O consumidor do fato, chamado diretamente — o mesmo encadeamento explícito que
		// `tests/flows/stop-control-plane.flow.test.ts` usa. Não há dispatcher a "drenar" no modo
		// `integration`: o TestBed só troca o OutboxDispatcher por um mock no modo `mock`.
		await testBed.resolve(MarkIssueNeedsInputFromStop).handle(
			new ThreadStopRaisedEvent({
				ownerId: issue.ownerId,
				payload: {
					stopId: uuidv7(),
					issueId: issue.id.value,
					threadId: thread.id.value,
					kind: StopKind.HUMAN_REQUESTED,
					detail: ReconcileStalledIssues.DETAIL,
				},
			}),
		)

		// A segunda varredura não a vê mais: a idempotência vem do PREDICADO (ela não está mais
		// `WORKING`), não de um registro de "já avisei".
		const second = await usecase.execute({})
		expect(second.stalledIssueIds).toEqual([])

		const reloaded = await testBed.resolve(IssueRepository).findById(issue.id.value)
		expect(reloaded?.status).toBe(IssueStatus.NEEDS_INPUT)
	})
})
