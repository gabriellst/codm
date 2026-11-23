import { describe, expect, it } from 'bun:test'
import { MailboxTargetKind, StopKind } from '@codm/contracts-typescript/wire/enums'
import { MailboxFailureClass } from '../enums/MailboxFailureClass'
import { RETRIED_TRANSPORT_STOP_KINDS, TRANSPORT_STOP_KINDS, TRANSPORT_STOP_RETRIES } from '../enums/TransportStopKind'
import { FAILURE_CLASS_OF_TRANSPORT_STOP, maxAttemptsOf, RETRY_SCHEDULE, STOP_OF_FAILURE } from './RetrySchedule'

const SECOND = 1000
const MINUTE = 60 * SECOND

/**
 * THE CALENDAR'S REAL NUMBERS (fase 5, item 2) — pinned here, because the dispatcher's tests lapse the waits instead of
 * sleeping through them. A change to any wait is a decision of the spec ("Item 2 — nova tentativa com espera
 * crescente"), and it has to show up as a red line in this file.
 */
describe('RETRY_SCHEDULE — how long a failed item waits, by lane and class', () => {
	it('the task lane: 1, 4, 15, 60 min for a provider error (5 attempts, ~1h20); crash 1, 4, 15; abandoned 15; login at once', () => {
		expect(RETRY_SCHEDULE[MailboxTargetKind.ISSUE]).toEqual({
			[MailboxFailureClass.PROVIDER_ERROR]: [1 * MINUTE, 4 * MINUTE, 15 * MINUTE, 60 * MINUTE],
			[MailboxFailureClass.CRASH]: [1 * MINUTE, 4 * MINUTE, 15 * MINUTE],
			[MailboxFailureClass.ABANDONED]: [15 * MINUTE],
			[MailboxFailureClass.CLI_LOGIN]: [0, 0],
		})
		expect(maxAttemptsOf(RETRY_SCHEDULE[MailboxTargetKind.ISSUE][MailboxFailureClass.PROVIDER_ERROR])).toBe(5)
	})

	it('the conversation lane: short waits that do not grow the count — a person is waiting', () => {
		expect(RETRY_SCHEDULE[MailboxTargetKind.THREAD]).toEqual({
			[MailboxFailureClass.PROVIDER_ERROR]: [10 * SECOND, 60 * SECOND],
			[MailboxFailureClass.CRASH]: [10 * SECOND, 60 * SECOND],
			[MailboxFailureClass.ABANDONED]: [0],
			[MailboxFailureClass.CLI_LOGIN]: [0, 0],
		})
	})

	it('a retried transport stop is classified by its KIND, and every retried kind has a class', () => {
		expect(FAILURE_CLASS_OF_TRANSPORT_STOP).toEqual({
			[StopKind.SERVER_ERROR]: MailboxFailureClass.PROVIDER_ERROR,
			[StopKind.AUTH_REQUIRED]: MailboxFailureClass.CLI_LOGIN,
		})
		// The retried subset is DERIVED from the retry table, never listed twice.
		const retried: StopKind[] = [...RETRIED_TRANSPORT_STOP_KINDS]
		const byTable: StopKind[] = TRANSPORT_STOP_KINDS.filter(kind => TRANSPORT_STOP_RETRIES[kind])
		expect(retried.sort()).toEqual(byTable.sort())
	})

	it('a spent calendar asks someone with the cause the group should read — login says login', () => {
		expect(STOP_OF_FAILURE).toEqual({
			[MailboxFailureClass.PROVIDER_ERROR]: StopKind.SERVER_ERROR,
			[MailboxFailureClass.CRASH]: StopKind.SERVER_ERROR,
			[MailboxFailureClass.ABANDONED]: StopKind.SERVER_ERROR,
			[MailboxFailureClass.CLI_LOGIN]: StopKind.AUTH_REQUIRED,
		})
	})
})
