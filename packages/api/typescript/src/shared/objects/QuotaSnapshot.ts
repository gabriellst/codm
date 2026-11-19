// The system's QUOTA HEALTH (fase 4, item 7) as the console and the cloud panel show it. Wire shapes, so
// they live in `shared/objects` and are published as named components.
//
// Two shapes on purpose: the console runs on the owner's machine and sees the budget's numbers (spend,
// learned ceiling, reserve — in the budget's cost unit); the cloud panel is opened by anyone holding a
// group link, so it gets PERCENTAGES and states only — never an absolute figure of the account.
import { z } from '@codm/core-typescript'
import { ProviderLimitWindow, QuotaState, SlotLimit } from '@codm/contracts-typescript/wire/enums'
import type Z from 'zod'

const amount = z.number().nonnegative()
const count = z.number().int().nonnegative()
const percent = z.number().min(0).max(100)

/** The console's health strip: the badge, both windows, the task slots and why, the queue, the disk. */
export const QuotaSnapshotSchema = z.object({
	state: z.enum(QuotaState),
	/** The provider's five-hour window: spend so far, learned ceiling, the orchestrator's free floor. */
	window: z.object({ spent: amount, ceiling: amount, reserve: amount, resetsAt: z.iso.datetime().optional() }),
	/** The provider's weekly window. */
	week: z.object({ spent: amount, ceiling: amount, resetsAt: z.iso.datetime().optional() }),
	/** Task slots: in use, the configured maximum, the effective number and what limits it. */
	slots: z.object({ inUse: count, max: count, effective: count, limitedBy: z.enum(SlotLimit) }),
	/** Task items waiting, and how many of them only the budget is holding. */
	queue: z.object({ pending: count, heldByBudget: count }),
	diskFreeBytes: count,
	/**
	 * The budget's verdict on one more task turn NOW, and whether it holds for real. In observation
	 * (`enforced: false`, the rollout's first week) a denial holds nothing — `state` is never `HOLDING` and
	 * `queue.heldByBudget` is 0 — so this is the only place that says what the budget WOULD hold, and which window
	 * would hold it.
	 */
	budget: z.object({ enforced: z.boolean(), admits: z.boolean(), heldBy: z.enum(ProviderLimitWindow).optional() }),
})
export type QuotaSnapshot = Z.output<typeof QuotaSnapshotSchema>

/** The cloud panel's health badge — percentages and states, never the account's absolute numbers. */
export const PanelHealthSchema = z.object({
	state: z.enum(QuotaState),
	windowPercent: percent,
	weekPercent: percent,
	slots: z.object({ inUse: count, effective: count }),
	queuePending: count,
	daemonSeenAt: z.iso.datetime(),
})
export type PanelHealth = Z.output<typeof PanelHealthSchema>
