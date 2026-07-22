import Z from 'zod'
import { AggregateRoot, z } from '@template/core-typescript'
import { Language } from '@template/contracts-typescript/wire/enums'

// Billing's own customer identity — the deliberate snapshots taken at onboarding, editable later by
// the responsible user. `name` is the generic owner display name captured at onboarding; `language`
// is the ACCOUNT's billing language (hosted checkout, dunning emails, stored invoice descriptions)
// — distinct from any user's UI language. Editable-copy policy: issued invoices never change
// retroactively.
const BillingProfileSchema = z.object({
	ownerId: z.string().min(1),
	name: z.string().min(1),
	email: z.email(),
	document: z.string().min(1),
	language: z.enum(Language),
})

export type BillingProfileProps = Z.infer<typeof BillingProfileSchema>

export class BillingProfile extends AggregateRoot<typeof BillingProfileSchema> {
	static override schema = BillingProfileSchema

	static create(data: { ownerId: string; name: string; email: string; document: string; language: Language }): BillingProfile {
		return new BillingProfile(data)
	}

	updateIdentity(data: { name?: string; email?: string; document?: string }): void {
		if (data.name !== undefined) this.name = data.name
		if (data.email !== undefined) this.email = data.email
		if (data.document !== undefined) this.document = data.document
		this.validate()
	}

	setLanguage(language: Language): void {
		this.language = language
		this.validate()
	}
}

export interface BillingProfile extends Z.infer<typeof BillingProfileSchema> {}
