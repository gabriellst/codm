import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { ProviderLimitWindow, QuotaState, SlotLimit } from '@codm/contracts-typescript/wire/enums'
import { TestBed } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { InMemoryQuotaStatus, type QuotaStatus } from '@agent/services/QuotaStatusReader'
import { GetSystemHealth } from './GetSystemHealth'

const account = (
	window: ProviderLimitWindow.FIVE_HOUR | ProviderLimitWindow.WEEKLY,
	spent: number,
	ceiling: number,
	resetsAt?: number,
) => ({
	window,
	spent,
	issueSpent: spent,
	reservedSpent: 0,
	ceiling,
	reserveFloor: ceiling * 0.05,
	...(resetsAt !== undefined && { resetsAt }),
})
const RESETS = Date.parse('2026-11-19T18:00:00.000Z')

/** A dispatcher status whose budget DENIES one more task turn on the five-hour window. */
const denied = (overrides: Partial<QuotaStatus> = {}): QuotaStatus => ({
	at: Date.now(),
	enforced: false,
	admission: {
		admitted: false,
		heldBy: ProviderLimitWindow.FIVE_HOUR,
		expectedTurnCost: 1,
		reserveShare: 0.05,
		accounts: {
			[ProviderLimitWindow.FIVE_HOUR]: account(ProviderLimitWindow.FIVE_HOUR, 96, 100, RESETS),
			[ProviderLimitWindow.WEEKLY]: account(ProviderLimitWindow.WEEKLY, 300, 1000),
		},
	},
	slots: { inUse: 2, max: 6, effective: 4, limitedBy: SlotLimit.MACHINE },
	diskFreeBytes: 5_000_000_000,
	providerRefusing: false,
	...overrides,
})

/**
 * THE CONSOLE'S HEALTH (fase 4, item 7) — read from what the dispatcher last saw. In OBSERVATION a denial holds
 * nothing: the badge is not HOLDING and nothing is "held by the budget" — the `budget` part says what it WOULD hold.
 *
 * Falsifier: compute the badge from the admission alone (ignoring `enforced`) and the observation case reads HOLDING.
 */
describe('GetSystemHealth — the strip reads the dispatcher, never invents', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const read = () => testBed.resolve(GetSystemHealth).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

	it('before the dispatcher’s first loop there is nothing to show', async () => {
		await expect(read()).rejects.toThrow(expect.objectContaining({ name: 'HEALTH_NOT_SAMPLED' }))
	})

	it('in observation a denial is a "would hold" — never presented as holding', async () => {
		testBed.resolve(InMemoryQuotaStatus).publish(denied())
		expect(await read()).toEqual({
			state: QuotaState.OK,
			window: { spent: 96, ceiling: 100, reserve: 5, resetsAt: '2026-11-19T18:00:00.000Z' },
			week: { spent: 300, ceiling: 1000 },
			slots: { inUse: 2, max: 6, effective: 4, limitedBy: SlotLimit.MACHINE },
			queue: { pending: 0, heldByBudget: 0 },
			diskFreeBytes: 5_000_000_000,
			budget: { enforced: false, admits: false, heldBy: ProviderLimitWindow.FIVE_HOUR },
		})
	})

	it('enforced, the same denial is a hold; the provider refusing outranks it', async () => {
		testBed.resolve(InMemoryQuotaStatus).publish(denied({ enforced: true }))
		expect((await read()).state).toBe(QuotaState.HOLDING)
		testBed.resolve(InMemoryQuotaStatus).publish(denied({ enforced: true, providerRefusing: true }))
		expect((await read()).state).toBe(QuotaState.REFUSED)
	})
})
