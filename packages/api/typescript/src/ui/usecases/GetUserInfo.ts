import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'
import { OwnerRepository } from '@owner/repositories'

const OwnerRefSchema = z.object({
	id: z.uuid(),
	name: z.string(),
})

// ---------------------------------------------------------------------------
// Input — user identity from ctx.user; ownerId = the active owner (nullable).
// ---------------------------------------------------------------------------
export const GetUserInfoInputSchema = z.object({
	user: z.object({ id: z.uuid(), name: z.string(), email: z.string() }),
	ownerId: z.uuid().nullable(),
})

export const GetUserInfoOutputSchema = z.object({
	user: z.object({ id: z.uuid(), name: z.string(), email: z.email(), avatarUrl: z.url().nullable() }),
	current: OwnerRefSchema.nullable(),
	owners: z.array(OwnerRefSchema),
})

/**
 * `GetUserInfo` — the Header's contextual read: user identity + every owner the
 * user is responsible for + the active owner. REAL user (ctx) + REAL owners
 * (owner context). No owner scope required (Header loads before an owner is
 * picked).
 *
 * The base models one responsible user per Owner (D2) — the user's owners are
 * exactly the ones where `Owner.responsibleUserId === user.id`. A product that
 * grafts the multi-user tenant exemplar under `examples/` swaps this for a member
 * read (with a role per owner).
 */
@injectable()
export class GetUserInfo extends Handler<typeof GetUserInfoInputSchema, typeof GetUserInfoOutputSchema> {
	readonly name = 'get_user_info' as const
	readonly inputSchema = GetUserInfoInputSchema
	readonly outputSchema = GetUserInfoOutputSchema

	constructor(private readonly owners: OwnerRepository) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const owned = await this.owners.findByResponsibleUserId(input.user.id)
		const owners = owned.map(owner => ({ id: owner.id.value, name: owner.name }))

		const current = input.ownerId ? (owners.find(o => o.id === input.ownerId) ?? null) : null

		return {
			user: { id: input.user.id, name: input.user.name, email: input.user.email, avatarUrl: null },
			current,
			owners,
		}
	}
}
