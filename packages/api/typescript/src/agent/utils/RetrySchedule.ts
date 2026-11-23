import { MailboxTargetKind, StopKind } from '@codm/contracts-typescript/wire/enums'
import { MailboxFailureClass } from '../enums/MailboxFailureClass'
import type { RetriedTransportStopKind } from '../enums/TransportStopKind'

const SECOND = 1000
const MINUTE = 60 * SECOND

/** The waits between an item's attempts — attempts = waits + 1. A wait of 0 retries at once (no lease, no cause). */
export type RetryWaits = readonly number[]

/** The whole calendar: per lane, per failure class. */
export type RetrySchedule = Record<MailboxTargetKind, Record<MailboxFailureClass, RetryWaits>>

/**
 * HOW LONG A FAILED ITEM WAITS BEFORE ITS NEXT ATTEMPT (fase 5, item 2) — by lane and by failure class, declared.
 *
 * Before this, every retried failure was released at once and the item came back on the next poll (250 ms): three
 * attempts in seconds, and the item was dead before a provider overload had passed. Measured on a real install (14 days
 * to 12/11): 114 items poisoned that way, 82 only resolved when someone took over, ~17 h later.
 *
 * - ISSUE lane: nobody waits in real time, and an overload passes in minutes — 1, 4, 15, 60 min for a provider error
 *   (5 attempts, ~1h20); a crash gets the first three; an abandoned turn (it may still be alive) waits 15 min once, so
 *   two turns of one task are less likely to overlap.
 * - THREAD lane: a person is waiting — short waits, and the count does not grow (10 s, 60 s).
 * - CLI_LOGIN, both lanes: time alone does not log a CLI in — two quick retries, as before, then the stop says "login".
 *
 * The real numbers are pinned by `RetrySchedule.test.ts`; the dispatcher holds this as a field so its tests can run the
 * same shapes in milliseconds.
 */
export const RETRY_SCHEDULE: RetrySchedule = {
	[MailboxTargetKind.ISSUE]: {
		[MailboxFailureClass.PROVIDER_ERROR]: [1 * MINUTE, 4 * MINUTE, 15 * MINUTE, 60 * MINUTE],
		[MailboxFailureClass.CRASH]: [1 * MINUTE, 4 * MINUTE, 15 * MINUTE],
		[MailboxFailureClass.ABANDONED]: [15 * MINUTE],
		[MailboxFailureClass.CLI_LOGIN]: [0, 0],
	},
	[MailboxTargetKind.THREAD]: {
		[MailboxFailureClass.PROVIDER_ERROR]: [10 * SECOND, 60 * SECOND],
		[MailboxFailureClass.CRASH]: [10 * SECOND, 60 * SECOND],
		[MailboxFailureClass.ABANDONED]: [0],
		[MailboxFailureClass.CLI_LOGIN]: [0, 0],
	},
}

/** A retried transport stop, classified by its KIND — never by the error's text. */
export const FAILURE_CLASS_OF_TRANSPORT_STOP: Record<RetriedTransportStopKind, MailboxFailureClass> = {
	[StopKind.SERVER_ERROR]: MailboxFailureClass.PROVIDER_ERROR,
	[StopKind.AUTH_REQUIRED]: MailboxFailureClass.CLI_LOGIN,
}

/**
 * The stop that asks someone once the calendar is spent — the cause the group reads. A login problem says login
 * (`AUTH_REQUIRED` → the CLI_LOGIN notice), never "erro do provedor".
 */
export const STOP_OF_FAILURE: Record<MailboxFailureClass, typeof StopKind.SERVER_ERROR | typeof StopKind.AUTH_REQUIRED> = {
	[MailboxFailureClass.PROVIDER_ERROR]: StopKind.SERVER_ERROR,
	[MailboxFailureClass.CRASH]: StopKind.SERVER_ERROR,
	[MailboxFailureClass.ABANDONED]: StopKind.SERVER_ERROR,
	[MailboxFailureClass.CLI_LOGIN]: StopKind.AUTH_REQUIRED,
}

/** How many attempts a calendar allows — one more than its waits. */
export const maxAttemptsOf = (waits: RetryWaits): number => waits.length + 1
