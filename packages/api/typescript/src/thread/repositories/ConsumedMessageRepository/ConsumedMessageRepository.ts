import type { Transaction } from '@codedm/core-typescript'

export interface ConsumeInput {
	ownerId: string
	channelId: string
	platformMessageId: string
	threadId?: string
	entryId?: string
}

/**
 * The BC4 inbound-message idempotency ledger (phase-6 hard gate). `claim` is the exactly-once
 * latch: it does an `INSERT ... ON CONFLICT DO NOTHING` on the `UNIQUE(channelId, platformMessageId)`
 * constraint and returns whether THIS delivery was the first (a row was inserted). The channel
 * gateway delivers at least once; the ingestion consumer proceeds only on a first claim, so a
 * redelivery of the same platform message is a no-op.
 */
export abstract class ConsumedMessageRepository {
	/** @returns true if this (channel, platform message) was recorded for the first time; false on redelivery. */
	abstract claim(input: ConsumeInput, tx?: Transaction): Promise<boolean>
	abstract has(channelId: string, platformMessageId: string, tx?: Transaction): Promise<boolean>

	/**
	 * Back-fill the row's `threadId`/`entryId` once ingestion has produced them.
	 *
	 * The ledger's columns for these have existed since the table was written and were never filled,
	 * because `claim` runs BEFORE ingestion (dedup-first is load-bearing: a redelivery must not reach
	 * the transcript) and at that moment no entry exists yet. Two calls, not one — the alternative is
	 * moving the claim after the ingest, which trades an unfilled column for a broken invariant.
	 */
	abstract linkEntry(
		input: { channelId: string; platformMessageId: string; threadId: string; entryId: string },
		tx?: Transaction,
	): Promise<void>

	/**
	 * The reverse lookup this ledger was always shaped for: a platform message id → the transcript
	 * entry it produced. It is what turns a WhatsApp reply-quote (`contextInfo.stanzaId`) into the
	 * `quotedEntryId` the router's authoritative shortcut needs, and — read the other way — what lets
	 * an outbound reply quote the message that opened an issue.
	 */
	abstract findEntry(
		channelId: string,
		platformMessageId: string,
		tx?: Transaction,
	): Promise<{ threadId: string; entryId: string } | undefined>

	/**
	 * The REVERSE direction: a transcript entry → the platform message it became.
	 *
	 * This is what lets an outbound reply QUOTE a specific earlier message — the orchestrator
	 * answering a finished issue anchors on the message that asked for it. `undefined` when the entry
	 * never reached the channel (a whisper, an audit line) or predates the ledger link.
	 */
	abstract findPlatformId(entryId: string, tx?: Transaction): Promise<string | undefined>
}
