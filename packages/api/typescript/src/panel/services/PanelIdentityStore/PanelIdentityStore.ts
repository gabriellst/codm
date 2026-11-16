import type { Transaction } from '@codm/core-typescript'
import type { PanelMember } from '@codm/contracts/db/pg'

export type { PanelMember }

/** The group a link opens, with the people the daemon last reported in it. */
export interface PanelIdentityGroup {
	threadId: string
	ownerId: string
	members: PanelMember[]
}

export interface PanelCodeRequestRow {
	id: string
	ownerId: string
	threadId: string
	memberId: string
	requestedAt: Date
	codeHash: string | null
	issuedAt: Date | null
	expiresAt: Date | null
	attempts: number
	usedAt: Date | null
}

export interface PanelSessionRow {
	tokenHash: string
	ownerId: string
	threadId: string
	memberId: string
	createdAt: Date
	expiresAt: Date
}

/**
 * Who a panel visitor is (fase 2, item 6a) — the roster the daemon reports, the code requests a person
 * makes, and the device sessions a verified code opens.
 *
 * The writes that guard a SECRET are one conditional statement each, never a read-then-write in a use
 * case: issuing (`issue`), spending an attempt (`spendAttempt`) and consuming a code (`consume`) are each
 * a single `UPDATE … WHERE … RETURNING`, so two tabs with the same code cannot both win and a burst of
 * guesses cannot exceed the cap. The request rate limit is read-then-insert on purpose: a race there
 * costs one extra DM, not a guess.
 */
export abstract class PanelIdentityStore {
	/** The group a link token opens, or nothing. */
	abstract groupByToken(token: string, tx?: Transaction): Promise<PanelIdentityGroup | undefined>
	/** Replace a group's roster — only when the group is the caller's. Returns whether it was. */
	abstract replaceMembers(ownerId: string, threadId: string, members: readonly PanelMember[], tx?: Transaction): Promise<boolean>

	/** When this member asked for codes since `since` — the rate limit's input. */
	abstract requestTimes(threadId: string, memberId: string, since: Date, tx?: Transaction): Promise<Date[]>
	abstract insertRequest(row: PanelCodeRequestRow, tx?: Transaction): Promise<void>
	/** Requests of this owner made since `since` and not handed to the daemon yet, oldest first. */
	abstract pendingRequests(ownerId: string, since: Date, tx?: Transaction): Promise<PanelCodeRequestRow[]>
	/** Stamp a request as handed over with its code HMAC — true for exactly one caller. Only the LATEST issued code of a member is ever checked, so a new one retires the older ones. */
	abstract issue(request: PanelCodeRequestRow, codeHash: string, issuedAt: Date, expiresAt: Date, tx?: Transaction): Promise<boolean>
	/** The member's most recently issued code, if any. */
	abstract latestIssued(threadId: string, memberId: string, tx?: Transaction): Promise<PanelCodeRequestRow | undefined>
	/** Spend one try (attempts + 1) unless the cap is reached. Returns the new count, or nothing when capped. */
	abstract spendAttempt(requestId: string, max: number, tx?: Transaction): Promise<number | undefined>
	/** Mark the code used — true for exactly one caller. */
	abstract consume(requestId: string, at: Date, tx?: Transaction): Promise<boolean>

	abstract insertSession(row: PanelSessionRow, tx?: Transaction): Promise<void>
	abstract findSession(tokenHash: string, tx?: Transaction): Promise<PanelSessionRow | undefined>
	abstract deleteSession(tokenHash: string, tx?: Transaction): Promise<void>

	/** The link was rotated: every session and code request of the group dies. */
	abstract revokeGroup(threadId: string, tx?: Transaction): Promise<void>
	/** Drop this owner's code requests older than `requestsBefore` and its sessions expired by `now`. */
	abstract purge(ownerId: string, requestsBefore: Date, now: Date, tx?: Transaction): Promise<void>
}
