import { Handler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { Language } from '@template/contracts-typescript/wire/enums'
import { BillingProfileRepository } from '@billing/repositories'
import { BillingProfile } from '@billing/entities'

export const RegisterBillingProfileInputSchema = z.object({
	ownerId: z.string().min(1),
	name: z.string().min(1),
	email: z.string().min(1),
	document: z.string().min(1),
	language: z.enum(Language),
})

export const RegisterBillingProfileOutputSchema = z.void()

// Called by CompleteOnboarding (ui) in the SAME tx — records the onboarding snapshots
// (spec Decision 6). Write-once: a replayed onboarding never clobbers later edits.
@injectable()
export class RegisterBillingProfile extends Handler<typeof RegisterBillingProfileInputSchema, typeof RegisterBillingProfileOutputSchema> {
	readonly name = 'register_billing_profile' as const
	readonly inputSchema = RegisterBillingProfileInputSchema
	readonly outputSchema = RegisterBillingProfileOutputSchema

	constructor(private billingProfiles: BillingProfileRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			await this.billingProfiles.insertIfNew(BillingProfile.create(input), tx)
		})
	}
}
