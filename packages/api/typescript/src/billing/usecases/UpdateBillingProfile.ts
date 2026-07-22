import { Handler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { BaseError } from '@template/core-typescript'
import { Language } from '@template/contracts-typescript/wire/enums'
import { OwnerDirectory } from '@shared/services'
import type { BaseInterfaceErrors } from '@template/core-typescript'
import { BillingProfileRepository } from '@billing/repositories'

export const UpdateBillingProfileInputSchema = z.object({
	ownerId: z.string().min(1),
	/** The authenticated auth-user id — the guard compares it to the owner's responsibleUserId. */
	actorUserId: z.string().min(1),
	name: z.string().min(1).optional(),
	email: z.string().min(1).optional(),
	document: z.string().min(1).optional(),
	language: z.enum(Language).optional(),
})

export const UpdateBillingProfileOutputSchema = z.object({
	name: z.string(),
	email: z.string(),
	document: z.string(),
	language: z.enum(Language),
})

// Spec Decision 12: only the tenant's responsible user edits the billing identity —
// the guard reads the TENANCY port (billing's single remaining OwnerDirectory use, Decision 8).
@injectable()
export class UpdateBillingProfile extends Handler<typeof UpdateBillingProfileInputSchema, typeof UpdateBillingProfileOutputSchema> {
	readonly name = 'update_billing_profile' as const
	readonly inputSchema = UpdateBillingProfileInputSchema
	readonly outputSchema = UpdateBillingProfileOutputSchema

	constructor(
		private ownerDirectory: OwnerDirectory,
		private billingProfiles: BillingProfileRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const tenancy = await this.ownerDirectory.getOwner(input.ownerId, tx)
			if (!tenancy || tenancy.responsibleUserId !== input.actorUserId) {
				throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED')
			}

			const profile = await this.billingProfiles.findByOwnerId(input.ownerId, tx)
			if (!profile) throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED')

			profile.updateIdentity({ name: input.name, email: input.email, document: input.document })
			if (input.language !== undefined) profile.setLanguage(input.language)
			await this.billingProfiles.save(profile, tx)

			return { name: profile.name, email: profile.email, document: profile.document, language: profile.language }
		})
	}
}
