import { describe, expect, it } from 'bun:test'
import { IssueLifeState, IssueStatus, MailboxDeferCause } from '@codm/contracts-typescript/wire/enums'
import { lifeStateOf, type PendingItem } from './issueLifeState'

const item = (overrides: Partial<PendingItem> = {}): PendingItem => ({ running: false, reminder: false, ...overrides })

describe('lifeStateOf — where an issue stands, by rule', () => {
	it('a completed issue is DONE whatever is left around it', () => {
		expect(
			lifeStateOf({
				held: false,
				budgetHeld: false,
				declaredWait: false,
				status: IssueStatus.COMPLETED,
				pending: [item({ running: true })],
				openStops: 1,
			}),
		).toBe(IssueLifeState.DONE)
	})

	it('a turn holding a lease is RUNNING — or REMINDED when that turn is the reminder', () => {
		expect(
			lifeStateOf({
				held: false,
				budgetHeld: false,
				declaredWait: false,
				status: IssueStatus.WORKING,
				pending: [item({ running: true })],
				openStops: 0,
			}),
		).toBe(IssueLifeState.RUNNING)
		expect(
			lifeStateOf({
				held: false,
				budgetHeld: false,
				declaredWait: false,
				status: IssueStatus.WORKING,
				pending: [item({ running: true, reminder: true })],
				openStops: 0,
			}),
		).toBe(IssueLifeState.REMINDED)
	})

	it('a deferred turn is WAITING_PROVIDER, even with a steer queued behind it', () => {
		expect(
			lifeStateOf({
				held: false,
				budgetHeld: false,
				declaredWait: false,
				status: IssueStatus.WORKING,
				pending: [item({ deferCause: MailboxDeferCause.PROVIDER_LIMIT }), item()],
				openStops: 0,
			}),
		).toBe(IssueLifeState.WAITING_PROVIDER)
	})

	it('queued work is QUEUED; a queued reminder alone is REMINDED', () => {
		expect(
			lifeStateOf({ held: false, budgetHeld: false, declaredWait: false, status: IssueStatus.WORKING, pending: [item()], openStops: 0 }),
		).toBe(IssueLifeState.QUEUED)
		expect(
			lifeStateOf({
				held: false,
				budgetHeld: false,
				declaredWait: false,
				status: IssueStatus.WORKING,
				pending: [item({ reminder: true })],
				openStops: 0,
			}),
		).toBe(IssueLifeState.REMINDED)
	})

	it('work beats a stop: a resolved stop that queued a steer is QUEUED, not WAITING_PERSON', () => {
		expect(
			lifeStateOf({
				held: false,
				budgetHeld: false,
				declaredWait: false,
				status: IssueStatus.NEEDS_INPUT,
				pending: [item()],
				openStops: 1,
			}),
		).toBe(IssueLifeState.QUEUED)
	})

	// Pausa como comando (fase 2, item 2). Falsifier: drop the `held` line from `lifeStateOf` and the held
	// issue with a deferred item reads WAITING_PROVIDER ("esperando cota") — a usage limit nobody hit.
	it('a held issue is PAUSED over a running, deferred or queued turn — but a completed one stays DONE', () => {
		expect(
			lifeStateOf({
				held: true,
				budgetHeld: false,
				declaredWait: false,
				status: IssueStatus.WORKING,
				pending: [item({ deferCause: MailboxDeferCause.PROVIDER_LIMIT })],
				openStops: 0,
			}),
		).toBe(IssueLifeState.PAUSED)
		expect(
			lifeStateOf({ held: true, budgetHeld: false, declaredWait: false, status: IssueStatus.NEEDS_INPUT, pending: [item()], openStops: 1 }),
		).toBe(IssueLifeState.PAUSED)
		expect(
			lifeStateOf({ held: true, budgetHeld: false, declaredWait: false, status: IssueStatus.COMPLETED, pending: [], openStops: 0 }),
		).toBe(IssueLifeState.DONE)
	})

	it('an open stop with nothing queued is WAITING_PERSON; nothing at all is STALLED', () => {
		expect(
			lifeStateOf({ held: false, budgetHeld: false, declaredWait: false, status: IssueStatus.NEEDS_INPUT, pending: [], openStops: 1 }),
		).toBe(IssueLifeState.WAITING_PERSON)
		expect(
			lifeStateOf({ held: false, budgetHeld: false, declaredWait: false, status: IssueStatus.WORKING, pending: [], openStops: 0 }),
		).toBe(IssueLifeState.STALLED)
	})

	// Fase 4 (S3). Falsifier: drop the `budgetHeld` line and a queued task under an enforced hold reads QUEUED — "na
	// fila" while nothing will claim it; read it from the observation mode too and the board shows a hold that is not
	// happening (the caller passes `holdsIssueLane()`, false in observation).
	it('queued work under an ENFORCED budget hold is WAITING_BUDGET — after the provider, before the queue', () => {
		expect(
			lifeStateOf({ held: false, budgetHeld: true, declaredWait: false, status: IssueStatus.WORKING, pending: [item()], openStops: 0 }),
		).toBe(IssueLifeState.WAITING_BUDGET)
		expect(
			lifeStateOf({
				held: false,
				budgetHeld: true,
				declaredWait: false,
				status: IssueStatus.WORKING,
				pending: [item({ deferCause: MailboxDeferCause.PROVIDER_LIMIT })],
				openStops: 0,
			}),
		).toBe(IssueLifeState.WAITING_PROVIDER)
		expect(
			lifeStateOf({
				held: false,
				budgetHeld: true,
				declaredWait: false,
				status: IssueStatus.WORKING,
				pending: [item({ running: true })],
				openStops: 0,
			}),
		).toBe(IssueLifeState.RUNNING)
		expect(
			lifeStateOf({ held: false, budgetHeld: true, declaredWait: false, status: IssueStatus.NEEDS_INPUT, pending: [], openStops: 1 }),
		).toBe(IssueLifeState.WAITING_PERSON)
		expect(
			lifeStateOf({ held: false, budgetHeld: false, declaredWait: false, status: IssueStatus.WORKING, pending: [item()], openStops: 0 }),
		).toBe(IssueLifeState.QUEUED)
	})

	// Fase 5 (S1): the deferral's state comes from its DECLARED cause. Falsifier: read every deferred item as
	// WAITING_PROVIDER again and the `HOLD` case below reads "esperando cota" for a pause that was already lifted.
	it('a deferral reads by its cause — a hold that outlived its resume is QUEUED, never a provider wait', () => {
		const at = (deferCause: MailboxDeferCause, budgetHeld = false) =>
			lifeStateOf({
				held: false,
				budgetHeld,
				declaredWait: false,
				status: IssueStatus.WORKING,
				pending: [item({ deferCause })],
				openStops: 0,
			})
		expect(at(MailboxDeferCause.PROVIDER_LIMIT)).toBe(IssueLifeState.WAITING_PROVIDER)
		expect(at(MailboxDeferCause.RETRY)).toBe(IssueLifeState.WAITING_RETRY)
		expect(at(MailboxDeferCause.HOLD)).toBe(IssueLifeState.QUEUED)
		expect(at(MailboxDeferCause.HOLD, true)).toBe(IssueLifeState.WAITING_BUDGET)
		// Provider before retry when both are declared on the same issue.
		expect(
			lifeStateOf({
				held: false,
				budgetHeld: false,
				declaredWait: false,
				status: IssueStatus.WORKING,
				pending: [item({ deferCause: MailboxDeferCause.RETRY }), item({ deferCause: MailboxDeferCause.PROVIDER_LIMIT })],
				openStops: 0,
			}),
		).toBe(IssueLifeState.WAITING_PROVIDER)
	})

	// Fase 5 (S3) — the owner's decision of 20/11: a feedback with no answer waits without a deadline. Falsifier: drop
	// `declaredWait` from the WAITING_PERSON line and a task that put a preview in front of the group reads STALLED
	// ("parada") the moment its turn ends.
	it('a declared wait (a feedback asked in the last turn) is WAITING_PERSON, never STALLED — work and a pause still win', () => {
		const at = (overrides: Partial<Parameters<typeof lifeStateOf>[0]>) =>
			lifeStateOf({
				held: false,
				budgetHeld: false,
				declaredWait: true,
				status: IssueStatus.WORKING,
				pending: [],
				openStops: 0,
				...overrides,
			})
		expect(at({})).toBe(IssueLifeState.WAITING_PERSON)
		expect(at({ declaredWait: false })).toBe(IssueLifeState.STALLED)
		expect(at({ pending: [item()] })).toBe(IssueLifeState.QUEUED)
		expect(at({ held: true })).toBe(IssueLifeState.PAUSED)
	})
})
