import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import { faker } from '@shared/testing/mock'

export const UploadAvatarInputSchema = z.object({
	ownerId: z.uuid(),
	userId: z.string(),
})

export const UploadAvatarOutputSchema = z.object({
	pictureUrl: z.string().url(),
})

/**
 * STUB: accept-and-echo multipart avatar upload — returns a faker avatar URL and stores nothing.
 *
 * Real swap: persist the uploaded bytes and return their URL. Until then this endpoint answers 200
 * with an invented picture, which is why it carries the marker — see `shared/testing/mock.stubs.test.ts`.
 */
@injectable()
export class UploadAvatar extends Handler<typeof UploadAvatarInputSchema, typeof UploadAvatarOutputSchema> {
	readonly name = 'upload_avatar' as const
	readonly inputSchema = UploadAvatarInputSchema
	readonly outputSchema = UploadAvatarOutputSchema

	protected async handle(_input: this['input']): Promise<this['output']> {
		return { pictureUrl: faker.image.avatar() }
	}
}
