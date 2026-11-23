import type { Meta, StoryObj } from '@storybook/react'
import { expect } from 'storybook/test'
import { ProviderLimitWindowEnum, QuotaStateEnum, SlotLimitEnum } from '@codm/client-typescript/typescript'
import type { GetSystemHealthQueryResponse } from '@codm/client-typescript/typescript'
import { SystemHealthFacts } from '.'

/**
 * Fase 4, item 7 — the health strip's facts, one story per quota state, plus the observation week's would-hold:
 * a denial that holds nothing reads as "would hold", never as the HOLDING badge.
 */

const health = (overrides: Partial<GetSystemHealthQueryResponse> = {}): GetSystemHealthQueryResponse => ({
	state: QuotaStateEnum.OK,
	window: { spent: 18, ceiling: 40, reserve: 2, resetsAt: '2026-11-19T18:00:00.000Z' },
	week: { spent: 210, ceiling: 420 },
	slots: { inUse: 3, max: 6, effective: 4, limitedBy: SlotLimitEnum.MACHINE },
	queue: { pending: 2, heldByBudget: 0 },
	diskFreeBytes: 12 * 1024 ** 3,
	budget: { enforced: false, admits: true },
	...overrides,
})

const meta = {
	title: 'Console/SystemHealthFacts',
	component: SystemHealthFacts,
	args: { health: health() },
} satisfies Meta<typeof SystemHealthFacts>
export default meta

type Story = StoryObj<typeof meta>

const badgeOf = (canvas: HTMLElement) => canvas.querySelector('[data-state]')?.getAttribute('data-state')
const wouldHoldOf = (canvas: HTMLElement) => canvas.querySelector('[data-testid="health-would-hold"]')

export const Ok: Story = {
	play: async ({ canvasElement }) => {
		await expect(badgeOf(canvasElement)).toBe(QuotaStateEnum.OK)
		await expect(canvasElement).toHaveTextContent('45%')
		await expect(wouldHoldOf(canvasElement)).toBeNull()
	},
}

export const Near: Story = {
	args: { health: health({ state: QuotaStateEnum.NEAR, week: { spent: 320, ceiling: 420 } }) },
	play: async ({ canvasElement }) => {
		await expect(badgeOf(canvasElement)).toBe(QuotaStateEnum.NEAR)
		await expect(canvasElement).toHaveTextContent('76%')
	},
}

/** Enforced: the budget holds — the badge says so and the queue shows what it holds; no would-hold line. */
export const Holding: Story = {
	args: {
		health: health({
			state: QuotaStateEnum.HOLDING,
			slots: { inUse: 0, max: 6, effective: 0, limitedBy: SlotLimitEnum.BUDGET },
			queue: { pending: 3, heldByBudget: 3 },
			budget: { enforced: true, admits: false, heldBy: ProviderLimitWindowEnum.FIVE_HOUR },
		}),
	},
	play: async ({ canvasElement }) => {
		await expect(badgeOf(canvasElement)).toBe(QuotaStateEnum.HOLDING)
		await expect(wouldHoldOf(canvasElement)).toBeNull()
	},
}

export const Refused: Story = {
	args: { health: health({ state: QuotaStateEnum.REFUSED }) },
	play: async ({ canvasElement }) => {
		await expect(badgeOf(canvasElement)).toBe(QuotaStateEnum.REFUSED)
	},
}

/** Observation: the budget would deny a task turn — said as a would-hold, the badge stays OK, nothing held. */
export const ObservationWouldHold: Story = {
	args: { health: health({ budget: { enforced: false, admits: false, heldBy: ProviderLimitWindowEnum.FIVE_HOUR } }) },
	play: async ({ canvasElement }) => {
		await expect(badgeOf(canvasElement)).toBe(QuotaStateEnum.OK)
		await expect(wouldHoldOf(canvasElement)).not.toBeNull()
	},
}
