import { PanelActionOutcome, PanelActionStatus } from '@codm/contracts-typescript/wire/enums'

/**
 * The numbers of "act from the panel" (fase 2, item 6b — `.specs/2026-11-16-falar-e-parar-na-hora-design.md`).
 * Named once so the use cases, the status read and the tests read the same values.
 */
export const PANEL_ACTIONS = {
	/** Actions one DEVICE may post a minute. */
	perDevicePerMinute: 20,
	/**
	 * An action is handed to the daemon only this long after it was asked. A daemon that comes back later
	 * must not pause, steer or approve on a click from minutes ago — the moment it answered has passed.
	 */
	liveMs: 2 * 60 * 1000,
	/** Handed out and no outcome back after this long → handed out again (the daemon dedups by id). */
	redeliverAfterMs: 45 * 1000,
	/** No outcome this long after the ask → EXPIRED: the page stops waiting. One pull past `liveMs`, plus slack. */
	expireAfterMs: 3 * 60 * 1000,
	/** Actions are kept a day, then purged. */
	retentionMs: 24 * 60 * 60 * 1000,
} as const

/** The status each daemon outcome reads as. */
const OUTCOME_STATUS: Readonly<Record<PanelActionOutcome, PanelActionStatus>> = {
	[PanelActionOutcome.DONE]: PanelActionStatus.DONE,
	[PanelActionOutcome.REFUSED]: PanelActionStatus.REFUSED,
}

/** Where an action stands, from what the store holds and the clock. */
export function panelActionStatus(row: { outcome: PanelActionOutcome | null; requestedAt: Date }, now: Date): PanelActionStatus {
	if (row.outcome) return OUTCOME_STATUS[row.outcome]
	return now.getTime() - row.requestedAt.getTime() > PANEL_ACTIONS.expireAfterMs ? PanelActionStatus.EXPIRED : PanelActionStatus.PENDING
}
