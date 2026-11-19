import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenThread } from '@test/support'
import {
	BatchItemDestinationKind,
	BatchStatus,
	ProviderLimitWindow,
	QuotaState,
	SlotLimit,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { InMemoryQuotaStatus, type QuotaStatus } from '@agent/services/QuotaStatusReader'
import { Batch } from '@thread/entities/Batch'
import { BatchRepository } from '@thread/repositories/BatchRepository'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { PanelPublisher, type MockPanelPublisher } from '../services/PanelPublisher'
import { PublishPanelSnapshot } from './PublishPanelSnapshot'
import { RotateThreadPanelLink } from './RotateThreadPanelLink'

/**
 * THE PANEL PUSH (fase 1). Every run sends the groups (the daemon's heartbeat) and only the issues that
 * changed; not logged in sends nothing and forgets nothing; the group link is known once a push returns it.
 *
 * Falsifiers: drop the fingerprint check and the second run resends the issue; remember fingerprints
 * before a successful send and the offline run swallows the issue forever.
 */
describe('PublishPanelSnapshot', () => {
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

	it('sends groups every run and only the issues that changed; offline sends and remembers nothing', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-1' })
		const publisher = testBed.resolve(PanelPublisher) as MockPanelPublisher
		const run = () => testBed.resolve(PublishPanelSnapshot).execute({})

		publisher.offline = true
		expect(await run()).toEqual({ sent: false, groups: 1, issues: 0, batches: 0 })

		publisher.offline = false
		expect(await run()).toEqual({ sent: true, groups: 1, issues: 1, batches: 0 })
		const first = publisher.batches.at(-1)
		expect(first?.groups.map(group => group.threadId)).toEqual([thread.id.value])
		expect(first?.issues.map(row => row.key)).toEqual(['APP-1'])
		expect(publisher.linkOf(thread.id.value)).toBe(`https://cloud.test/panel/g/token-${thread.id.value}`)

		// Nothing changed: the groups go (heartbeat), the issue does not.
		expect(await run()).toEqual({ sent: true, groups: 1, issues: 0, batches: 0 })

		// Something happened to the issue: it goes again, with the new moment in its timeline.
		thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: 'prévia pronta', issueId: issue.id.value })
		await testBed.resolve(ThreadRepository).save(thread)
		expect(await run()).toEqual({ sent: true, groups: 1, issues: 1, batches: 0 })
		expect(publisher.batches.at(-1)?.issues[0]?.timeline.some(item => item.kind === 'MESSAGE')).toBe(true)
	})

	it('the console reads a group link once pushed, and rotating replaces it; before any push there is none to rotate', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-2' })
		const fresh = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		await testBed.resolve(PublishPanelSnapshot).execute({})
		expect((testBed.resolve(PanelPublisher) as MockPanelPublisher).linkOf(thread.id.value)).toBe(
			`https://cloud.test/panel/g/token-${thread.id.value}`,
		)
		expect((await testBed.resolve(RotateThreadPanelLink).execute({ threadId: thread.id.value })).url).toBe(
			`https://cloud.test/panel/g/rotated-${thread.id.value}`,
		)

		const refused = await testBed
			.resolve(RotateThreadPanelLink)
			.execute({ threadId: fresh.id.value })
			.then(
				() => undefined,
				(error: unknown) => error,
			)
		expect(refused).toEqual(expect.objectContaining({ name: 'PANEL_LINK_UNAVAILABLE' }))
	})

	const account = (window: ProviderLimitWindow.FIVE_HOUR | ProviderLimitWindow.WEEKLY, spent: number, ceiling: number) => ({
		window,
		spent,
		issueSpent: spent,
		reservedSpent: 0,
		ceiling,
		reserveFloor: ceiling * 0.05,
	})
	const status = (overrides: Partial<QuotaStatus> = {}): QuotaStatus => ({
		at: Date.now(),
		enforced: false,
		admission: {
			admitted: false,
			heldBy: ProviderLimitWindow.FIVE_HOUR,
			expectedTurnCost: 1,
			reserveShare: 0.05,
			accounts: {
				[ProviderLimitWindow.FIVE_HOUR]: account(ProviderLimitWindow.FIVE_HOUR, 96, 100),
				[ProviderLimitWindow.WEEKLY]: account(ProviderLimitWindow.WEEKLY, 300, 1000),
			},
		},
		slots: { inUse: 2, max: 6, effective: 4, limitedBy: SlotLimit.MACHINE },
		diskFreeBytes: 5_000_000_000,
		providerRefusing: false,
		...overrides,
	})

	it('the health badge rides every push — percentages and states only; absent before the dispatcher’s first loop', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-3' })
		const publisher = testBed.resolve(PanelPublisher) as MockPanelPublisher
		const run = () => testBed.resolve(PublishPanelSnapshot).execute({})

		await run()
		expect(publisher.batches.at(-1)?.health).toBeUndefined()

		// Observation: the budget would hold the five-hour window — the panel never says HOLDING for it.
		testBed.resolve(InMemoryQuotaStatus).publish(status())
		await run()
		const health = publisher.batches.at(-1)?.health
		expect(health).toMatchObject({ state: QuotaState.OK, windowPercent: 96, weekPercent: 30, slots: { inUse: 2, effective: 4 } })
		expect(Object.keys(health ?? {}).sort()).toEqual(['daemonSeenAt', 'queuePending', 'slots', 'state', 'weekPercent', 'windowPercent'])

		// Enforced, the same denial IS a hold.
		testBed.resolve(InMemoryQuotaStatus).publish(status({ enforced: true }))
		await run()
		expect(publisher.batches.at(-1)?.health?.state).toBe(QuotaState.HOLDING)
	})

	it('a group’s batch goes with the push once, and again only when it changes', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-4' })
		const publisher = testBed.resolve(PanelPublisher) as MockPanelPublisher
		const run = () => testBed.resolve(PublishPanelSnapshot).execute({})
		const batch = Batch.open({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			seq: 31,
			sourceEntryId: crypto.randomUUID(),
			items: [
				{ n: 1, excerpt: 'pedido 1' },
				{ n: 2, excerpt: 'pedido 2' },
			],
		})
		await testBed.resolve(BatchRepository).save(batch)

		expect((await run()).batches).toBe(1)
		expect(publisher.batches.at(-1)?.batches).toEqual([
			{
				threadId: thread.id.value,
				batch: {
					code: 'L-31',
					status: BatchStatus.INCOMPLETE,
					sourceEntryId: batch.sourceEntryId,
					items: [
						{ n: 1, excerpt: 'pedido 1' },
						{ n: 2, excerpt: 'pedido 2' },
					],
				},
			},
		])
		expect((await run()).batches).toBe(0)

		batch.recordDestinations(
			[1, 2].map(n => ({ n, destination: { kind: BatchItemDestinationKind.DECLINED, reason: 'fora do escopo' } as const })),
			new Date(),
		)
		batch.recordReceipt(crypto.randomUUID())
		await testBed.resolve(BatchRepository).save(batch)
		expect((await run()).batches).toBe(1)
		expect(publisher.batches.at(-1)?.batches?.[0]?.batch.status).toBe(BatchStatus.RECORDED)
	})
})
