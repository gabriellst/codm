import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { agentMailbox } from '@codm/contracts/db'
import {
	BatchItemDestinationKind,
	BatchStatus,
	GroupOutputMode,
	IssueTimelineItemKind,
	Language,
	MailboxDeferCause,
	MailboxTargetKind,
	OutputRouting,
	PermissionPosture,
	StopKind,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenThread, GIVEN_MENTION_TAG } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { IssueAttributesRepository } from '@agent/repositories/IssueAttributesRepository'
import { ISSUE_ATTRIBUTE_DEFAULTS, IssueAttributes } from '@agent/entities/IssueAttributes'
import { ForkIssue } from '@agent/usecases/ForkIssue'
import { PanelPublisher } from '@issue/services/PanelPublisher'
import { assembleIssueTimeline } from '@issue/utils/issueTimeline'
import type { Participant } from '../entities/Thread'
import { BatchRepository } from '../repositories/BatchRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { BATCH_RECEIPT_LEVEL, ROUTING_BY_MODE } from '../utils/OutputPolicy'
import { BATCH_REMIND_AFTER_MS, BATCH_STALL_AFTER_MS, FollowUpIncompleteBatches } from './FollowUpIncompleteBatches'
import { IngestChannelMessage } from './IngestChannelMessage'
import { BATCH_STALL_CLOSED_BY, RecordBatch } from './RecordBatch'

/**
 * THE BATCH RECEIPT (fase 4, item 5 — aceite "10 itens, 10 destinos"): a listed message opens a batch by rule (never
 * the triage); the orchestrator records every item at once; the receipt goes ONCE, through the output policy; the
 * linked issues show the item on their timeline; an ATTACHED item is that task's steer; a batch left incomplete gets
 * a reminder, then the conversation's STALLED notice.
 *
 * Falsifier: drop `recorded_at` from the item write and the timeline assertion fails; route the receipt straight to
 * the channel and the DECISIONS_ONLY case sends a message.
 */
describe('RecordBatch — one destination per item, one receipt per batch', () => {
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

	const MEMBER = 'member-a'
	const roster: Participant[] = [
		{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true, canElevate: true },
		{ participantId: MEMBER, name: 'Member A', source: 'Group member', canInvoke: true, canElevate: false },
	]
	const deliveries = () => testBed.probe().count('scheduledCommands', { name: 'deliver_channel_message' })
	/** The raw mailbox — the batch rides an item's JSON payload, which no probe exposes (see the probe-discipline exemption). */
	const mailboxDb = () => testBed.resolve(LibSqlDatabaseDriver).db

	/** A conversation in `mode`, and a message listing `count` requests from a member. */
	const scene = async (count: number, mode = GroupOutputMode.DECISIONS_AND_LIVE) => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, participants: roster })
		thread.configureLanguage(Language.PT_BR)
		thread.configureOutputMode(mode)
		await testBed.resolve(ThreadRepository).save(thread)
		const text = [
			`${GIVEN_MENTION_TAG} segue o que falta:`,
			...Array.from({ length: count }, (_, index) => `${index + 1}. pedido ${index + 1}`),
		]
		const ingested = await testBed.resolve(IngestChannelMessage).execute({
			threadId: thread.id.value,
			senderExternalId: MEMBER,
			text: text.join('\n'),
			receivedAt: new Date(),
			platformMessageId: `platform-${Math.random()}`,
		})
		return { thread, threadId: thread.id.value, ingested }
	}
	const fork = (threadId: string, goal: string) =>
		testBed
			.resolve(ForkIssue)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId, goal, originEntryId: crypto.randomUUID(), posture: PermissionPosture.AUTO })
	const declined = (n: number) => ({ n, destination: { kind: BatchItemDestinationKind.DECLINED, reason: `motivo ${n}` } as const })
	const record = (threadId: string, items: Parameters<RecordBatch['execute']>[0]['items']) =>
		testBed.resolve(RecordBatch).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId, batchCode: 'L-1', items })
	const batchOf = (threadId: string) => testBed.resolve(BatchRepository).findByCode(threadId, 'L-1')

	it('a listed message opens batch L-1 by rule — the orchestrator item carries it, and it skips the triage', async () => {
		const { threadId, ingested } = await scene(4)
		expect(ingested.triage).toBe(false)
		const batch = await batchOf(threadId)
		expect(batch?.status).toBe(BatchStatus.INCOMPLETE)
		expect(batch?.sourceEntryId).toBe(ingested.entryId)
		const [item] = await mailboxDb().select().from(agentMailbox).where(eq(agentMailbox.dedupKey, ingested.entryId))
		expect(item?.payload).toMatchObject({
			batch: {
				batchCode: 'L-1',
				total: 4,
				pending: [1, 2, 3, 4].map(n => ({ n, excerpt: `pedido ${n}` })),
			},
		})
	})

	it('10 items → 10 destinations, the receipt once, and the linked issue shows the item on its timeline', async () => {
		const { threadId } = await scene(10)
		await testBed.resolve(PanelPublisher).rotate(threadId)
		const { issueId } = await fork(threadId, 'pedido 1')
		const before = await deliveries()

		const out = await record(threadId, [
			{ n: 1, destination: { kind: BatchItemDestinationKind.NEW_ISSUE, issueId } },
			...[2, 3, 4, 5, 6, 7, 8, 9, 10].map(declined),
		])

		expect(out.routing).toBe(OutputRouting.GROUP)
		const batch = await batchOf(threadId)
		expect(batch?.status).toBe(BatchStatus.RECORDED)
		expect(batch?.items.filter(item => item.destination !== undefined)).toHaveLength(10)
		const receipt = await testBed.resolve(ThreadRepository).findEntry(out.receiptEntryId)
		expect(receipt?.text).toContain('Lote L-1: 10 → 1 tarefa nova, 9 recusados (motivo 2; motivo 3; motivo 4; +6).')
		expect(receipt?.text).toContain(`/panel/g/rotated-${threadId}#L-1`)
		expect(receipt).toMatchObject({ level: BATCH_RECEIPT_LEVEL, routing: OutputRouting.GROUP })
		expect(await deliveries()).toBe(before + 1)

		const timeline = await assembleIssueTimeline(testBed.resolve(LibSqlDatabaseDriver), issueId, 'pedido 1')
		expect(timeline.find(item => item.kind === IssueTimelineItemKind.BATCH_LINKED)).toMatchObject({ batchCode: 'L-1', n: 1 })

		// Said once: a second record answers with the same receipt and sends nothing.
		const again = await record(threadId, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(declined))
		expect(again.receiptEntryId).toBe(out.receiptEntryId)
		expect(await deliveries()).toBe(before + 1)
	})

	it('9 of 10 is refused with the missing item named, and no receipt goes out', async () => {
		const { threadId } = await scene(10)
		const before = await deliveries()
		await expect(record(threadId, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(declined))).rejects.toThrow(
			expect.objectContaining({ name: 'BATCH_ITEMS_MISMATCH', message: expect.stringContaining('missing 10') }),
		)
		expect((await batchOf(threadId))?.status).toBe(BatchStatus.INCOMPLETE)
		expect(await deliveries()).toBe(before)
	})

	it('an issue of another conversation is refused; one forked in this very turn is accepted', async () => {
		const { threadId } = await scene(3)
		const other = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const { issueId: foreign } = await fork(other.id.value, 'de outra conversa')
		await expect(
			record(threadId, [{ n: 1, destination: { kind: BatchItemDestinationKind.NEW_ISSUE, issueId: foreign } }, declined(2), declined(3)]),
		).rejects.toThrow(expect.objectContaining({ name: 'BATCH_ISSUE_NOT_IN_THREAD' }))

		const { issueId } = await fork(threadId, 'pedido 1')
		const out = await record(threadId, [
			{ n: 1, destination: { kind: BatchItemDestinationKind.NEW_ISSUE, issueId } },
			declined(2),
			declined(3),
		])
		expect(out.batchCode).toBe('L-1')
	})

	it('an ATTACHED item becomes that task’s steer', async () => {
		const { threadId } = await scene(3)
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId, key: 'APP-40', title: 'Página de preços' })
		await testBed
			.resolve(IssueAttributesRepository)
			.insertIfNew(IssueAttributes.born({ issueId: issue.id.value, ownerId: MOCK_CLOUD_OWNER_ID, threadId, ...ISSUE_ATTRIBUTE_DEFAULTS }))

		await record(threadId, [
			{ n: 1, destination: { kind: BatchItemDestinationKind.ATTACHED, issueId: issue.id.value } },
			declined(2),
			declined(3),
		])

		expect(await testBed.resolve(MailboxRepository).hasPending(MailboxTargetKind.ISSUE, issue.id.value)).toBe(true)
	})

	it('in DECISIONS_ONLY the receipt is the panel’s line — the policy decides, nothing is sent', async () => {
		const { threadId } = await scene(3, GroupOutputMode.DECISIONS_ONLY)
		const before = await deliveries()
		const out = await record(threadId, [1, 2, 3].map(declined))
		expect(out.routing).toBe(ROUTING_BY_MODE[GroupOutputMode.DECISIONS_ONLY][BATCH_RECEIPT_LEVEL])
		expect(out.routing).toBe(OutputRouting.PANEL)
		expect(await deliveries()).toBe(before)
		expect((await batchOf(threadId))?.receiptEntryId).toBe(out.receiptEntryId)
	})

	it('the receipt level never routes to a digest — one message per batch in every mode', () => {
		for (const mode of Object.values(GroupOutputMode)) expect(ROUTING_BY_MODE[mode][BATCH_RECEIPT_LEVEL]).not.toBe(OutputRouting.DIGEST)
	})

	it('left incomplete: a reminder once the orchestrator is idle, then the STALLED notice — once', async () => {
		const { threadId, ingested } = await scene(3)
		const sweep = testBed.resolve(FollowUpIncompleteBatches)
		const batch = await batchOf(threadId)
		const at = (ms: number) => new Date((batch?.createdAt.getTime() ?? 0) + ms)

		// The batch's own turn has not run: not late, its turn has not come.
		expect(await sweep.execute({ now: at(BATCH_REMIND_AFTER_MS + 1000) })).toEqual({ reminded: 0, stalled: 0 })
		// Nor while a provider pause defers it — long past the stall mark.
		const [own] = await mailboxDb().select().from(agentMailbox).where(eq(agentMailbox.dedupKey, ingested.entryId))
		await testBed.resolve(MailboxRepository).defer([own?.id ?? ''], at(BATCH_STALL_AFTER_MS * 10), MailboxDeferCause.PROVIDER_LIMIT)
		expect(await sweep.execute({ now: at(BATCH_STALL_AFTER_MS + 1000) })).toEqual({ reminded: 0, stalled: 0 })
		await mailboxDb().update(agentMailbox).set({ consumedAt: new Date() }).where(eq(agentMailbox.dedupKey, ingested.entryId))

		expect(await sweep.execute({ now: at(BATCH_REMIND_AFTER_MS + 1000) })).toEqual({ reminded: 1, stalled: 0 })
		const [reminder] = await mailboxDb()
			.select()
			.from(agentMailbox)
			.where(eq(agentMailbox.dedupKey, `batch-reminder:${batch?.id.value}`))
		expect(reminder?.payload).toMatchObject({ batch: { batchCode: 'L-1' } })
		await mailboxDb()
			.update(agentMailbox)
			.set({ consumedAt: new Date() })
			.where(eq(agentMailbox.dedupKey, `batch-reminder:${batch?.id.value}`))

		expect(await sweep.execute({ now: at(BATCH_STALL_AFTER_MS + 1000) })).toEqual({ reminded: 0, stalled: 1 })
		const stop = await testBed.resolve(ThreadRepository).findStop(batch?.id.value ?? '')
		expect(stop?.kind).toBe(StopKind.STALLED)
		expect(await sweep.execute({ now: at(BATCH_STALL_AFTER_MS + 2000) })).toEqual({ reminded: 0, stalled: 0 })
	})

	it('recorded after the STALLED notice: the notice closes with the record — it never stays open over a recorded batch', async () => {
		const { threadId, ingested } = await scene(3)
		const sweep = testBed.resolve(FollowUpIncompleteBatches)
		const batch = await batchOf(threadId)
		const at = (ms: number) => new Date((batch?.createdAt.getTime() ?? 0) + ms)
		const consume = (dedupKey: string) =>
			mailboxDb().update(agentMailbox).set({ consumedAt: new Date() }).where(eq(agentMailbox.dedupKey, dedupKey))
		await consume(ingested.entryId)
		expect(await sweep.execute({ now: at(BATCH_REMIND_AFTER_MS + 1000) })).toEqual({ reminded: 1, stalled: 0 })
		await consume(`batch-reminder:${batch?.id.value}`)
		expect(await sweep.execute({ now: at(BATCH_STALL_AFTER_MS + 1000) })).toEqual({ reminded: 0, stalled: 1 })
		const threads = testBed.resolve(ThreadRepository)
		expect((await threads.findStop(batch?.id.value ?? ''))?.resolvedAt).toBeUndefined()

		await record(threadId, [1, 2, 3].map(declined))

		const stop = await threads.findStop(batch?.id.value ?? '')
		expect(stop?.resolvedAt).toBeInstanceOf(Date)
		expect(stop?.resolution).toBe(BATCH_STALL_CLOSED_BY)
		expect((await threads.openStops(threadId)).some(open => open.stopId === batch?.id.value)).toBe(false)
	})
})
