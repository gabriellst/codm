import { describe, expect, it } from 'bun:test'
import { IssueLifeState, IssueStatus } from '@codm/contracts-typescript/wire/enums'
import { lifeStateOf, type PendingItem } from './issueLifeState'

const item = (overrides: Partial<PendingItem> = {}): PendingItem => ({ running: false, deferred: false, reminder: false, ...overrides })

describe('lifeStateOf — where an issue stands, by rule', () => {
	it('a completed issue is DONE whatever is left around it', () => {
		expect(lifeStateOf({ status: IssueStatus.COMPLETED, pending: [item({ running: true })], openStops: 1 })).toBe(IssueLifeState.DONE)
	})

	it('a turn holding a lease is RUNNING — or REMINDED when that turn is the reminder', () => {
		expect(lifeStateOf({ status: IssueStatus.WORKING, pending: [item({ running: true })], openStops: 0 })).toBe(IssueLifeState.RUNNING)
		expect(lifeStateOf({ status: IssueStatus.WORKING, pending: [item({ running: true, reminder: true })], openStops: 0 })).toBe(
			IssueLifeState.REMINDED,
		)
	})

	it('a deferred turn is WAITING_PROVIDER, even with a steer queued behind it', () => {
		expect(lifeStateOf({ status: IssueStatus.WORKING, pending: [item({ deferred: true }), item()], openStops: 0 })).toBe(
			IssueLifeState.WAITING_PROVIDER,
		)
	})

	it('queued work is QUEUED; a queued reminder alone is REMINDED', () => {
		expect(lifeStateOf({ status: IssueStatus.WORKING, pending: [item()], openStops: 0 })).toBe(IssueLifeState.QUEUED)
		expect(lifeStateOf({ status: IssueStatus.WORKING, pending: [item({ reminder: true })], openStops: 0 })).toBe(IssueLifeState.REMINDED)
	})

	it('work beats a stop: a resolved stop that queued a steer is QUEUED, not WAITING_PERSON', () => {
		expect(lifeStateOf({ status: IssueStatus.NEEDS_INPUT, pending: [item()], openStops: 1 })).toBe(IssueLifeState.QUEUED)
	})

	it('an open stop with nothing queued is WAITING_PERSON; nothing at all is STALLED', () => {
		expect(lifeStateOf({ status: IssueStatus.NEEDS_INPUT, pending: [], openStops: 1 })).toBe(IssueLifeState.WAITING_PERSON)
		expect(lifeStateOf({ status: IssueStatus.WORKING, pending: [], openStops: 0 })).toBe(IssueLifeState.STALLED)
	})
})
