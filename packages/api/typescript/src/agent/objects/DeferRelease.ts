import { MailboxDeferCause } from '@codm/contracts-typescript/wire/enums'

/**
 * The three moments that may end a deferral before its lease lapses (fase 5, item 2) — the releasers that exist on
 * this line. Not a boot release nor a probe: neither exists here (#69).
 *  - `onProviderCredit` — a turn of the same provider ran to its end (`creditAcceptedTurn`).
 *  - `onIssueResume` — the issue was resumed (`ReleaseIssueWorkOnResume`).
 *  - `onNewItem` — a new item arrived for the same target (`MailboxRepository.enqueue`).
 */
export interface DeferReleasers {
	onProviderCredit: boolean
	onIssueResume: boolean
	onNewItem: boolean
}

/**
 * WHO MAY END WHICH DEFERRAL — declared per cause, so a releaser asks the row's cause, never a join on `paused`
 * (Non-Negotiable 5: the shape "ownerless future lease" is written by three causes, and only the cause says whose).
 *
 * - `PROVIDER_LIMIT`: released by an accepted turn of its provider and by the issue's resume — as before the column.
 * - `HOLD`: released by the resume; also by an accepted turn, as before (the dispatcher re-holds it at the claim if the
 *   issue is still paused).
 * - `RETRY`: never by the provider answering (another turn passing proves nothing about this one) nor by a resume
 *   (resuming is no reason to spend the attempt early) — only by a NEW item for the same target, which hands the
 *   attempt back (the person's message must not use it up), and by the lease lapsing on the schedule.
 */
export const DEFER_RELEASE: Record<MailboxDeferCause, DeferReleasers> = {
	[MailboxDeferCause.PROVIDER_LIMIT]: { onProviderCredit: true, onIssueResume: true, onNewItem: false },
	[MailboxDeferCause.HOLD]: { onProviderCredit: true, onIssueResume: true, onNewItem: false },
	[MailboxDeferCause.RETRY]: { onProviderCredit: false, onIssueResume: false, onNewItem: true },
}
