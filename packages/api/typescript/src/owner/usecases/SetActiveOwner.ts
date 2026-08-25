import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z, PgDatabaseDriver } from '@codm/core-typescript'
import { eq } from 'drizzle-orm'
import { sessions } from '@codm/contracts/db/pg'
import { OwnerRepository } from '../repositories/OwnerRepository'
import type { ApplicationErrors } from '../errors'

export const SetActiveOwnerInputSchema = z.object({
	ownerId: z.string(),
	userId: z.uuid(),
	sessionId: z.string(),
})

export const SetActiveOwnerOutputSchema = z.object({
	ownerId: z.string(),
})

@injectable()
export class SetActiveOwner extends Handler<typeof SetActiveOwnerInputSchema, typeof SetActiveOwnerOutputSchema> {
	readonly name = 'set_active_owner' as const
	readonly inputSchema = SetActiveOwnerInputSchema
	readonly outputSchema = SetActiveOwnerOutputSchema

	constructor(
		private readonly owners: OwnerRepository,
		private readonly driver: PgDatabaseDriver,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const { ownerId, userId, sessionId } = input

		// Guard: the user must be the responsible user for the target owner (D2 —
		// the base has a single responsible user per tenant, no member-role axis).
		const owner = await this.owners.findByOwnerId(ownerId)
		if (!owner || owner.responsibleUserId !== userId) {
			throw new BaseError<ApplicationErrors>('OWNER_NOT_FOUND')
		}

		// Targeted single-column update on the sessions table — no entity/aggregate is
		// involved (same targeted-update pattern as the better-auth sign-in hook) and no
		// domain event is raised.
		//
		// `db.transaction` do drizzle, e não uma costura do driver: a família pg NÃO declara
		// `transaction()`, e o docblock do `PgDatabaseDriver` diz por quê — a costura do gêmeo libsql
		// existe porque pedir transação ao cliente dele vaza descritor e reverte pragmas (medido).
		// Aqui não há esse defeito, então não há o que abstrair. A menção anterior a "the injected
		// drizzle client is the READ connection" era fato daquela família, não desta.
		await this.driver.db.transaction(tx =>
			tx.update(sessions).set({ activeOwnerId: ownerId, updatedAt: new Date() }).where(eq(sessions.id, sessionId)),
		)

		return { ownerId }
	}
}
