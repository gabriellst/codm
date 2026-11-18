import type { Transaction } from '@codm/core-typescript'
import type { PanelActionKind, PanelActionOutcome as PanelActionOutcomeEnum } from '@codm/contracts-typescript/wire/enums'
import type { PanelActionBody, PanelActionOutcome } from '@shared/schemas'

export interface PanelActionRow {
	id: string
	ownerId: string
	threadId: string
	memberId: string
	/** The device that asked (SHA-256 of its session token) — the rate limit's key. */
	sessionHash: string
	kind: PanelActionKind
	payload: PanelActionBody
	requestedAt: Date
	deliveredAt: Date | null
	outcome: PanelActionOutcomeEnum | null
	outcomeCode: string | null
	outcomeAt: Date | null
}

/**
 * The actions people ask for on the panel (fase 2, item 6b) — stored, handed to the daemon, answered.
 *
 * Handing out (`handOut`) and answering (`recordOutcome`) are each ONE conditional statement, never a
 * read-then-write in a use case: two concurrent pulls cannot both take an action in the same window, and a
 * late or repeated outcome never overwrites the first one. The device rate limit is read-then-insert on
 * purpose: a race there costs one extra stored action, which the daemon still executes only once.
 */
export abstract class PanelActionStore {
	abstract insert(row: PanelActionRow, tx?: Transaction): Promise<void>
	/** When this device posted actions since `since` — the rate limit's input. */
	abstract requestTimes(sessionHash: string, since: Date, tx?: Transaction): Promise<Date[]>
	abstract find(id: string, tx?: Transaction): Promise<PanelActionRow | undefined>
	/**
	 * Stamp and return this owner's actions due for the daemon, oldest first: no outcome yet, asked since
	 * `askedSince`, and never handed out or handed out before `redeliverBefore`.
	 */
	abstract handOut(ownerId: string, now: Date, askedSince: Date, redeliverBefore: Date, tx?: Transaction): Promise<PanelActionRow[]>
	/** Record the daemon's outcome — only on this owner's action, only once. Returns whether it landed. */
	abstract recordOutcome(ownerId: string, outcome: PanelActionOutcome, at: Date, tx?: Transaction): Promise<boolean>
	/** The link was rotated: every action of the group dies. */
	abstract revokeGroup(threadId: string, tx?: Transaction): Promise<void>
	/** Drop this owner's actions asked before `before`. */
	abstract purge(ownerId: string, before: Date, tx?: Transaction): Promise<void>
}
