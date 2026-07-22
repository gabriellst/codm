import type { Transaction } from '@template/core-typescript'

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
}
