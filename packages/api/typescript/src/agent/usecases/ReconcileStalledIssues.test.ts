import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { DomainEventRepository, OutboxDispatcher } from '@codm/core-typescript'
import { TestBed, givenIssue, givenThread, givenDomainEvent } from '@test/support'
import {
	IssueSignalLevel,
	IssueStatus,
	MailboxClaimClass,
	MailboxDeferCause,
	MailboxItemKind,
	MailboxTargetKind,
	NudgeSource,
	OutputRouting,
	PermissionPosture,
	StopKind,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { ThreadStopRaisedEvent } from '@codm/contracts-typescript/wire/events'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { IssueArchiveReason } from '@codm/contracts-typescript/wire/enums'
import { MarkIssueNeedsInputFromStop } from '@issue/handlers/MarkIssueNeedsInputFromStop'
import { RecordStopFromExecution } from '@thread/handlers/RecordStopFromExecution'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { MailboxRepository } from '../repositories/MailboxRepository'
import { AgentRunCompletedEvent } from '../events/AgentRunCompletedEvent'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { AgentIssueNudgedEvent } from '../events/AgentIssueNudgedEvent'
import { IssueSpokeEvent } from '../events/IssueSpokeEvent'
import { NudgePayloadSchema } from '../objects/NudgePayload'
import { FactSource } from '../enums'
import { NUDGE_TEXT, ReconcileStalledIssues } from './ReconcileStalledIssues'

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
			claimClass: MailboxClaimClass.STEER,
			posture: PermissionPosture.AUTO,
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

	/** A turn of the issue ran and ended: its item claimed and consumed — what the dispatcher writes. */
	async function quietTurn(issueId: string, threadId: string, during?: () => Promise<void>): Promise<string> {
		await enqueueSteer(MOCK_CLOUD_OWNER_ID, issueId, threadId)
		const mailbox = testBed.resolve(MailboxRepository)
		const turn = await mailbox.claimNext('reconcile-test', 60_000, [MailboxTargetKind.ISSUE])
		if (!turn) throw new Error('no turn claimed')
		await during?.()
		await mailbox.complete([turn.id])
		return turn.id
	}

	/** The nudge the sweep queued runs and ALSO ends without declaring. Returns its claimed item. */
	async function quietNudge(during?: () => Promise<void>) {
		const mailbox = testBed.resolve(MailboxRepository)
		const nudge = await mailbox.claimNext('reconcile-test', 60_000, [MailboxTargetKind.ISSUE])
		if (!nudge) throw new Error('no nudge claimed')
		await during?.()
		await mailbox.complete([nudge.id])
		return nudge
	}

	/** The facts the sweep (or a tool) wrote are dispatched — in production the outbox poller does it within seconds. */
	const settle = () => testBed.resolve(OutboxDispatcher).flush()

	/** The issue asked for feedback — what `RequestFeedback` records, by this issue. */
	async function askFeedback(issueId: string, threadId: string): Promise<void> {
		await givenDomainEvent(
			testBed,
			new IssueSpokeEvent({
				entityId: issueId,
				ownerId: MOCK_CLOUD_OWNER_ID,
				payload: { issueId, threadId, level: IssueSignalLevel.FEEDBACK, text: 'prévia pronta', artifactIds: [] },
			}),
		)
	}

	/**
	 * ATÉ DOIS EMPURRÕES (fase 5, item 1). A turn that ran and went quiet gets nudge 1 (declare); a nudge 1 that goes
	 * quiet gets nudge 2 (finish the step, then declare) of the SAME episode; only a nudge 2 that also goes quiet
	 * becomes the stop, with a text that says so.
	 *
	 * Falsifiers: `NUDGES_BEFORE_STALL = 1` and the second sweep parks the issue; read "is a nudge" off the payload
	 * (or nothing) and the second sweep sends nudge 1 again instead of 2.
	 */
	it('a quiet turn gets nudge 1, then nudge 2 of the same episode; a nudge 2 that also goes quiet becomes the stop', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		const quiet = await quietTurn(issue.id.value, thread.id.value)

		const first = await usecase.execute({})
		expect(first).toEqual({ stalledIssueIds: [], nudgedIssueIds: [issue.id.value] })
		// While the nudge is in flight, the sweep leaves the issue alone.
		expect(await usecase.execute({})).toEqual({ stalledIssueIds: [], nudgedIssueIds: [] })
		const nudge1 = await quietNudge()
		expect(nudge1.claimClass).toBe(MailboxClaimClass.REMINDER)
		expect(nudge1.posture).toBe(PermissionPosture.AUTO)
		expect(NudgePayloadSchema.parse(nudge1.payload).nudge).toEqual({ ordinal: 1, rootItemId: quiet, source: NudgeSource.RECONCILER })
		expect((nudge1.payload as { text: string }).text).toBe(NUDGE_TEXT[1])
		await settle()

		const second = await usecase.execute({})
		expect(second).toEqual({ stalledIssueIds: [], nudgedIssueIds: [issue.id.value] })
		const nudge2 = await quietNudge()
		expect(NudgePayloadSchema.parse(nudge2.payload).nudge).toEqual({ ordinal: 2, rootItemId: quiet, source: NudgeSource.RECONCILER })
		expect((nudge2.payload as { text: string }).text).toBe(NUDGE_TEXT[2])
		await settle()

		const third = await usecase.execute({})
		expect(third).toEqual({ stalledIssueIds: [issue.id.value], nudgedIssueIds: [] })
		const [stop] = await testBed.resolve(DomainEventRepository).findByType(AgentRunStopRaisedEvent)
		expect(stop?.payload).toMatchObject({ kind: StopKind.STALLED, detail: ReconcileStalledIssues.DETAIL_AFTER_NUDGES })

		// One fact per nudge, in the enqueue's transaction — what the timeline shows and the supervisor counts.
		const nudged = await testBed.resolve(DomainEventRepository).findByType(AgentIssueNudgedEvent)
		expect(nudged.map(fact => fact.payload.ordinal).sort()).toEqual([1, 2])
		expect(nudged.every(fact => fact.entityId === issue.id.value && fact.payload.rootItemId === quiet)).toBe(true)
	})

	it('nudge 2 says it authorizes nothing irreversible', () => {
		expect(NUDGE_TEXT[2]).toContain('do not publish')
		expect(NUDGE_TEXT[2]).toContain('merge')
	})

	it('a person writing between nudges starts a new episode — nudge 1 again, rooted on their message', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		await quietTurn(issue.id.value, thread.id.value)
		await usecase.execute({})
		await quietNudge()
		await settle()

		const message = await quietTurn(issue.id.value, thread.id.value)
		expect((await usecase.execute({})).nudgedIssueIds).toEqual([issue.id.value])
		const nudge = await quietNudge()
		expect(NudgePayloadSchema.parse(nudge.payload).nudge).toMatchObject({ ordinal: 1, rootItemId: message })
	})

	/** 0038 turned the old reminders into `REMINDER` + `nudge { ordinal: 1 }`, without a root: its own id stands in. */
	it('a reminder migrated by 0038 counts as nudge 1', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issue.id.value,
			kind: MailboxItemKind.STEER,
			claimClass: MailboxClaimClass.REMINDER,
			posture: PermissionPosture.AUTO,
			payload: { text: 'declare', nudge: { ordinal: 1, source: NudgeSource.RECONCILER } },
			dedupKey: uuidv7(),
		})
		const migrated = await quietNudge()

		expect((await usecase.execute({})).nudgedIssueIds).toEqual([issue.id.value])
		const nudge = await quietNudge()
		expect(NudgePayloadSchema.parse(nudge.payload).nudge).toMatchObject({ ordinal: 2, rootItemId: migrated.id })
	})

	/**
	 * WHO IS NEVER NUDGED (fase 5, item 1 — the closed list, one negative each, five sweeps each). Each issue ran a turn
	 * that ended quiet — the case that WOULD be nudged — plus the one thing that makes it a declared wait or work in
	 * flight. Falsifiers: drop the `DeclaredWaitReader` exclusion and the feedback cases are nudged; drop the `IssueHold`
	 * check and the paused-conversation case is (`PauseThread` writes only `threads.paused`).
	 */
	describe('never nudged nor stalled — five sweeps each', () => {
		/** What five sweeps did to the issue — `[]` when they neither nudged nor parked it. */
		async function fiveSweeps(issueId: string): Promise<string[]> {
			const touched: string[] = []
			for (let sweep = 0; sweep < 5; sweep++) {
				await settle()
				const out = await usecase.execute({})
				if (out.nudgedIssueIds.includes(issueId)) touched.push(`nudged on sweep ${sweep + 1}`)
				if (out.stalledIssueIds.includes(issueId)) touched.push(`stalled on sweep ${sweep + 1}`)
			}
			return touched
		}

		it('a feedback asked in the last turn (it waits without a deadline)', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
			await quietTurn(issue.id.value, thread.id.value, () => askFeedback(issue.id.value, thread.id.value))
			expect(await fiveSweeps(issue.id.value)).toEqual([])
		})

		it('a feedback asked in reply to nudge 1 ends the episode', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
			await quietTurn(issue.id.value, thread.id.value)
			await usecase.execute({})
			await quietNudge(() => askFeedback(issue.id.value, thread.id.value))
			expect(await fiveSweeps(issue.id.value)).toEqual([])
		})

		it('a paused conversation', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
			await quietTurn(issue.id.value, thread.id.value)
			thread.pause()
			await testBed.resolve(ThreadRepository).save(thread)
			expect(await fiveSweeps(issue.id.value)).toEqual([])
		})

		it('a paused issue', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
			await quietTurn(issue.id.value, thread.id.value)
			issue.pause()
			await testBed.resolve(IssueRepository).save(issue)
			expect(await fiveSweeps(issue.id.value)).toEqual([])
		})

		for (const cause of Object.values(MailboxDeferCause)) {
			it(`an item deferred by ${cause}`, async () => {
				const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
				const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
				await quietTurn(issue.id.value, thread.id.value)
				await enqueueSteer(MOCK_CLOUD_OWNER_ID, issue.id.value, thread.id.value)
				const mailbox = testBed.resolve(MailboxRepository)
				const next = await mailbox.claimNext('reconcile-test', 60_000, [MailboxTargetKind.ISSUE])
				if (!next) throw new Error('no item claimed')
				await mailbox.defer([next.id], new Date(Date.now() + 60 * 60_000), cause)
				expect(await fiveSweeps(issue.id.value)).toEqual([])
			})
		}

		it('a turn running', async () => {
			const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
			await quietTurn(issue.id.value, thread.id.value)
			await enqueueSteer(MOCK_CLOUD_OWNER_ID, issue.id.value, thread.id.value)
			await testBed.resolve(MailboxRepository).claimNext('reconcile-test', 600_000, [MailboxTargetKind.ISSUE])
			expect(await fiveSweeps(issue.id.value)).toEqual([])
		})

		for (const kind of [StopKind.DECISION_REQUESTED, StopKind.QUESTION_ASKED, StopKind.APPROVAL_NEEDED, StopKind.PERMISSION_DENIED]) {
			it(`an open ${kind} stop`, async () => {
				const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
				const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
				await quietTurn(issue.id.value, thread.id.value)
				await testBed.resolve(MarkIssueNeedsInputFromStop).handle(
					new ThreadStopRaisedEvent({
						ownerId: issue.ownerId,
						payload: { stopId: uuidv7(), issueId: issue.id.value, threadId: thread.id.value, kind, detail: 'aberto' },
					}),
				)
				expect(await fiveSweeps(issue.id.value)).toEqual([])
			})
		}
	})

	/** The counterpart of the feedback negatives: a feedback asked in an EARLIER turn does not hold a later quiet one. */
	it('a feedback from an earlier turn does not hold a later quiet turn', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		await quietTurn(issue.id.value, thread.id.value, () => askFeedback(issue.id.value, thread.id.value))
		// Instants are millisecond-grained and a tie reads as "said during the turn": the later turn starts after it.
		await Bun.sleep(2)
		await quietTurn(issue.id.value, thread.id.value)
		await settle()
		expect((await usecase.execute({})).nudgedIssueIds).toEqual([issue.id.value])
	})

	/**
	 * FASE 3 — the stall has its own kind, and it is a BLOCK NOTICE in the group. Before, the reconciler
	 * wrote `HUMAN_REQUESTED` (the `AskOperator` kind), which says nothing on the channel: the prose of a turn
	 * that declared nothing ended in silence, only on the panel.
	 */
	it('the stop with no turn to nudge is STALLED, and it reaches the group as a block notice', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'APP-12' })

		expect((await usecase.execute({})).stalledIssueIds).toEqual([issue.id.value])
		const [fact] = await testBed.resolve(DomainEventRepository).findByType(AgentRunStopRaisedEvent)
		expect(fact?.payload.kind).toBe(StopKind.STALLED)
		expect(fact?.payload.source).toBe(FactSource.INFERRED)

		// The thread's consumer of the bridged fact, called directly — no dispatcher to drain in `integration`.
		await testBed.resolve(RecordStopFromExecution).handle(
			new ThreadStopRaisedEvent({
				ownerId: issue.ownerId,
				payload: {
					stopId: fact!.payload.stopId,
					issueId: issue.id.value,
					threadId: thread.id.value,
					kind: fact!.payload.kind,
					detail: fact!.payload.detail,
				},
			}),
		)

		const notice = (await testBed.resolve(ThreadRepository).listEntries(thread.id.value)).find(e => e.kind === TranscriptKind.SYSTEM)
		expect(notice).toMatchObject({ issueId: issue.id.value, level: IssueSignalLevel.BLOCK_NOTICE, routing: OutputRouting.GROUP })
		expect(notice?.text).toContain('APP-12')
		expect(await testBed.probe().count('scheduledCommands', { name: 'deliver_channel_message' })).toBe(1)
	})

	it('does NOT touch an issue with a mailbox item still in flight', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		await enqueueSteer(issue.ownerId, issue.id.value, thread.id.value)

		const { stalledIssueIds } = await usecase.execute({})

		expect(stalledIssueIds).toEqual([])
	})

	/**
	 * A ISSUE PRESA VOLTA A SER VISÍVEL — o buraco que fazia esta varredura rodar sessenta vezes por
	 * hora sem nunca enxergar uma issue morta.
	 *
	 * `consumed_at` e `dead_at` de um item reclamado por um worker que morreu ficam NULL PARA SEMPRE:
	 * ninguém as escreve a não ser o próprio worker. O predicado parava aí, então "não consumido e não
	 * envenenado" era lido como "em voo" e a issue sumia desta varredura permanentemente. Medido em
	 * 27/08: duas issues nesse estado por mais de meia hora, com o lease sendo renovado por um
	 * `setInterval` cujo turno nunca assentou e sem nenhum processo de provedor vivo.
	 *
	 * O falsificador é exato: tire a cláusula do lease do `inFlightMailbox` e este teste fica vermelho —
	 * a issue volta a ser invisível, que é o defeito.
	 */
	it('vê uma issue cujo item ficou com o lease EXPIRADO — o worker morreu e ninguém mais o segura', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		await enqueueSteer(issue.ownerId, issue.id.value, thread.id.value)

		// Lease NEGATIVO: já nasce expirado há dois minutos, além da graça de uma cadência. Sem isto o
		// teste teria de dormir, e um teste que dorme mede o relógio, não o predicado.
		const claimed = await testBed.resolve(MailboxRepository).claimNext('worker-que-morreu', -120_000)
		expect(claimed).toBeDefined()

		const { stalledIssueIds } = await usecase.execute({})

		expect(stalledIssueIds).toEqual([issue.id.value])
	})

	/**
	 * O outro lado da mesma linha, e o que impede o conserto de virar falso positivo: um lease VIVO é
	 * um turno rodando, e um turno rodando pode durar vinte minutos legítimos.
	 */
	it('não toca numa issue cujo item está com lease VIVO — isso é um turno em andamento', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		await enqueueSteer(issue.ownerId, issue.id.value, thread.id.value)

		await testBed.resolve(MailboxRepository).claimNext('worker-trabalhando', 600_000)

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
					kind: StopKind.STALLED,
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
