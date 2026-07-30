import { injectable } from 'tsyringe-neo'
import { and, eq } from 'drizzle-orm'
import { DrizzleClient } from '@codm/core-typescript'
import { consumedMessages } from '@codm/contracts/db'
import { ConsumedMessageRepository, type ConsumeInput } from './ConsumedMessageRepository'

@injectable()
export class DrizzleConsumedMessageRepository extends ConsumedMessageRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async claim(input: ConsumeInput, tx?: DrizzleClient): Promise<boolean> {
		const dbc = tx ?? this.db
		// The exactly-once latch: ON CONFLICT DO NOTHING against the unique constraint. `returning`
		// yields the inserted row ONLY when no conflict occurred — so a non-empty result === first
		// delivery, an empty result === redelivery (no-op). This is atomic at the DB, race-free.
		const inserted = await dbc
			.insert(consumedMessages)
			.values({
				// Minted here — infra table, no aggregate, no db-side default. See the note in
				// DrizzleClarificationRepository on why ids never come from `$defaultFn`.
				id: crypto.randomUUID(),
				ownerId: input.ownerId,
				channelId: input.channelId,
				platformMessageId: input.platformMessageId,
				threadId: input.threadId ?? null,
				entryId: input.entryId ?? null,
			})
			.onConflictDoNothing({ target: [consumedMessages.channelId, consumedMessages.platformMessageId] })
			.returning({ id: consumedMessages.id })
		return inserted.length > 0
	}

	async linkEntry(
		input: { channelId: string; platformMessageId: string; threadId: string; entryId: string },
		tx?: DrizzleClient,
	): Promise<void> {
		const dbc = tx ?? this.db
		await dbc
			.update(consumedMessages)
			.set({ threadId: input.threadId, entryId: input.entryId })
			.where(and(eq(consumedMessages.channelId, input.channelId), eq(consumedMessages.platformMessageId, input.platformMessageId)))
	}

	async findEntry(
		channelId: string,
		platformMessageId: string,
		tx?: DrizzleClient,
	): Promise<{ threadId: string; entryId: string } | undefined> {
		const dbc = tx ?? this.db
		const rows = await dbc
			.select({ threadId: consumedMessages.threadId, entryId: consumedMessages.entryId })
			.from(consumedMessages)
			.where(and(eq(consumedMessages.channelId, channelId), eq(consumedMessages.platformMessageId, platformMessageId)))
			.limit(1)
		const row = rows[0]
		// A row with null columns is a message that was CLAIMED but dropped before ingestion (unattached
		// contact, non-text variant) — it produced no entry, so there is nothing to quote.
		if (!row?.threadId || !row.entryId) return undefined
		return { threadId: row.threadId, entryId: row.entryId }
	}

	async findPlatformId(entryId: string, tx?: DrizzleClient): Promise<string | undefined> {
		const dbc = tx ?? this.db
		const rows = await dbc
			.select({ platformMessageId: consumedMessages.platformMessageId })
			.from(consumedMessages)
			.where(eq(consumedMessages.entryId, entryId))
			.limit(1)
		return rows[0]?.platformMessageId
	}

	async has(channelId: string, platformMessageId: string, tx?: DrizzleClient): Promise<boolean> {
		const dbc = tx ?? this.db
		const rows = await dbc
			.select({ id: consumedMessages.id })
			.from(consumedMessages)
			.where(and(eq(consumedMessages.channelId, channelId), eq(consumedMessages.platformMessageId, platformMessageId)))
			.limit(1)
		return rows.length > 0
	}
}
