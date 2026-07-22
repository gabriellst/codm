import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'
import { faker } from '@shared/testing/mock'

export const UploadAvatarInputSchema = z.object({
	ownerId: z.uuid(),
	userId: z.string(),
})

export const UploadAvatarOutputSchema = z.object({
	pictureUrl: z.string().url(),
})

/** MOCK. Accept-and-echo multipart avatar upload — returns the new pictureUrl. */
@injectable()
export class UploadAvatar extends Handler<typeof UploadAvatarInputSchema, typeof UploadAvatarOutputSchema> {
	readonly name = 'upload_avatar' as const
	readonly inputSchema = UploadAvatarInputSchema
	readonly outputSchema = UploadAvatarOutputSchema

	protected async handle(_input: this['input']): Promise<this['output']> {
		return { pictureUrl: faker.image.avatar() }
	}
}
