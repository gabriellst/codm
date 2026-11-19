import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { DatabaseDriver, DomainEventRepository, type BaseDomainEvent } from '@codm/core-typescript'
import { AgentModelId, ProviderKind, ProviderLimitWindow, UsageRole } from '@codm/contracts-typescript/wire/enums'
import { TestBed } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ProviderLimitStatus } from '../../enums/ProviderLimitStatus'
import { AgentUsageEvent } from '../../events/AgentUsageEvent'
import { AgentProviderLimitEvent } from '../../events/AgentProviderLimitEvent'
import { AgentRunStartedEvent } from '../../events/AgentRunStartedEvent'
import { AgentQuotaHeldEvent, AgentQuotaReleasedEvent } from '../../events/AgentQuotaHeldEvent'
import { costOf, weightsFor } from '../../utils/UsageCost'
import { QuotaLedgerReader } from './QuotaLedgerReader'

/**
 * THE BUDGET'S LEDGER, READ FROM THE STORE (fase 4, S2): role-stamped usage priced by the model that ran it, a row
 * written before fase 4 (no role) never guessed into one, the provider's verdicts with their window and reset, and
 * the issue run starts — only since the instant asked.
 */
describe('LibSqlQuotaLedgerReader', () => {
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

	const save = async (...facts: BaseDomainEvent[]) => {
		const events = testBed.resolve(DomainEventRepository)
		await testBed
			.resolve(DatabaseDriver)
			.unitOfWorkFactory.create()
			.transaction(async tx => {
				for (const fact of facts) await events.save(fact, tx)
			})
	}
	const buckets = { inputTokens: 10, outputTokens: 100, cacheCreationInputTokens: 1_000, cacheReadInputTokens: 10_000 }
	const envelope = { entityId: 'issue-1', ownerId: MOCK_CLOUD_OWNER_ID }

	it('reads priced, role-stamped usage, the verdicts and the run starts — and ignores a usage row with no role', async () => {
		const resetsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
		await save(
			new AgentUsageEvent({
				...envelope,
				payload: {
					...buckets,
					role: UsageRole.ISSUE,
					provider: ProviderKind.CLAUDE_CODE,
					model: AgentModelId.SONNET,
					windows: [{ window: ProviderLimitWindow.FIVE_HOUR, resetsAt }],
				},
			}),
			new AgentUsageEvent({ ...envelope, payload: buckets }),
			new AgentProviderLimitEvent({
				...envelope,
				payload: {
					provider: ProviderKind.CLAUDE_CODE,
					role: UsageRole.ISSUE,
					window: ProviderLimitWindow.WEEKLY,
					status: ProviderLimitStatus.REJECTED,
					resetsAt,
				},
			}),
			new AgentRunStartedEvent({
				...envelope,
				payload: { issueId: 'issue-1', threadId: 'thread-1', key: 'APP-1', title: 't', provider: ProviderKind.CLAUDE_CODE },
			}),
		)

		const ledger = await testBed.resolve(QuotaLedgerReader).read(new Date(Date.now() - 60_000))

		expect(ledger.usage).toHaveLength(1)
		expect(ledger.usage[0]).toMatchObject({
			entityId: 'issue-1',
			role: UsageRole.ISSUE,
			cost: costOf(buckets, weightsFor(ProviderKind.CLAUDE_CODE, AgentModelId.SONNET)),
			windows: [{ window: ProviderLimitWindow.FIVE_HOUR, resetsAt: Date.parse(resetsAt) }],
		})
		expect(ledger.limits).toEqual([
			expect.objectContaining({ window: ProviderLimitWindow.WEEKLY, status: ProviderLimitStatus.REJECTED, resetsAt: Date.parse(resetsAt) }),
		])
		expect(ledger.issueRunStarts).toEqual([expect.objectContaining({ entityId: 'issue-1' })])
		expect(ledger.firstRoleFactAt).toBe(ledger.usage[0]!.at)
	})

	it('reads nothing older than the instant asked', async () => {
		await save(
			new AgentUsageEvent({
				...envelope,
				payload: { ...buckets, role: UsageRole.ORCHESTRATOR, provider: ProviderKind.CLAUDE_CODE, model: AgentModelId.DEFAULT },
			}),
		)
		const ledger = await testBed.resolve(QuotaLedgerReader).read(new Date(Date.now() + 60_000))
		expect(ledger.usage).toEqual([])
		// the first role-stamped fact of the store is known regardless of the horizon — the reserve needs a week of it
		expect(ledger.firstRoleFactAt).toBeDefined()
	})

	it('reads the budget’s holds and releases — observation ones included, the probe counts them', async () => {
		const payload = { window: ProviderLimitWindow.FIVE_HOUR, spent: 10, ceiling: 9, reserve: 1, enforced: false }
		await save(new AgentQuotaHeldEvent({ payload }))
		await save(new AgentQuotaReleasedEvent({ payload }))
		const ledger = await testBed.resolve(QuotaLedgerReader).read(new Date(Date.now() - 60_000))
		expect(ledger.holds.map(hold => ({ holding: hold.holding, enforced: hold.enforced, window: hold.window }))).toEqual([
			{ holding: true, enforced: false, window: ProviderLimitWindow.FIVE_HOUR },
			{ holding: false, enforced: false, window: ProviderLimitWindow.FIVE_HOUR },
		])
	})
})
