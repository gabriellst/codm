import { injectable } from 'tsyringe-neo'
import { and, eq } from 'drizzle-orm'
import { DrizzleClient } from '@codedm/core-typescript'
import { consumedMessages } from '@codedm/contracts/db'
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
