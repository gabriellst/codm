import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { UserRepository as AuthUserRepository } from '@auth/repositories/UserRepository/UserRepository'
import { ProfileUpdatedEvent } from '../events'
import { UserProfile } from '../entities/UserProfile'
import { UserProfileRepository } from '../repositories/UserProfileRepository'
import { Language } from '@template/contracts-typescript/wire/enums'
import type { ApplicationErrors } from '../errors'

export const UpdateProfileInputSchema = z.object({
	userId: z.uuid(),
	name: z.string().min(1).optional(),
	pictureUrl: z.url().nullable().optional(),
	// Supplementary UserProfile fields (the aggregate the auth context owns since the 	// collapse). Language is the single contracts wire enum; timezone is IANA (entity-validated).
	timezone: z.string().optional(),
	language: z.enum(Language).optional(),
})

export const UpdateProfileOutputSchema = z.void()

@injectable()
export class UpdateProfile extends Handler<typeof UpdateProfileInputSchema, typeof UpdateProfileOutputSchema> {
	readonly name = 'update_profile' as const
	readonly inputSchema = UpdateProfileInputSchema
	readonly outputSchema = UpdateProfileOutputSchema

	constructor(
		private readonly authUserRepo: AuthUserRepository,
		private readonly userProfileRepo: UserProfileRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const authUser = await this.authUserRepo.findById(input.userId, tx)
			if (!authUser) throw new BaseError<ApplicationErrors>('USER_PROFILE_NOT_FOUND')

			let changed = false
			if (input.name !== undefined && input.name !== authUser.name) {
				authUser.name = input.name
				changed = true
			}
			if (input.pictureUrl !== undefined && (input.pictureUrl ?? null) !== authUser.image) {
				authUser.image = input.pictureUrl ?? null
				changed = true
			}

			// Supplementary profile fields persist on the UserProfile aggregate.
			let profile = await this.userProfileRepo.findByUserId(input.userId, tx)
			if (input.timezone !== undefined || input.language !== undefined) {
				profile ??= UserProfile.create({ userId: input.userId })
				profile.updateProfile({ timezone: input.timezone, language: input.language })
				await this.userProfileRepo.save(profile, tx)
				changed = true
			}

			if (!changed) return

			await this.authUserRepo.save(authUser, tx)
			await this.domainEventRepository.save(
				new ProfileUpdatedEvent({
					entityId: input.userId,
					ownerId: input.userId,
					// UserProfile entity doesn't carry name/pictureUrl (those live on the
					// better-auth user). We snapshot the UserProfile aggregate from the
					// identity context — the event payload types the serialized (.input())
					// wire form, so toJSON() flows in without a cast.
					payload: {
						userProfile: (profile ?? UserProfile.create({ userId: input.userId })).toJSON(),
					},
				}),
				tx,
			)
		})
	}
}
