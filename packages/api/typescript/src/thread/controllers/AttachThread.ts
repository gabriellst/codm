import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { ContactKind, ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { AttachThread, AttachThreadInputSchema, AttachThreadOutputSchema } from '../usecases/AttachThread'

// Body COMPOSED from the use case input (single source): everything but the middleware-provided ownerId.
export const AttachThreadControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		body: AttachThreadInputSchema.omit({ ownerId: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			body: {
				contactRef: {
					channelId: '019e4d24-6524-7041-9e1c-8108180cddae',
					externalId: '5511999999999@s.whatsapp.net',
					displayName: 'Ada',
					kind: ContactKind.CONTACT,
				},
				workspaceId: '019e4d24-6524-7041-9e1c-8108180cddb0',
				providers: [ProviderKind.CLAUDE_CODE],
			},
		},
	])

export const AttachThreadControllerOutputSchema = AttachThreadOutputSchema.example([{ threadId: '019e4d24-6524-7041-9e1c-8108180cddae' }])

@injectable()
export class AttachThreadController extends Controller<
	typeof AttachThreadControllerInputSchema,
	typeof AttachThreadControllerOutputSchema
> {
	readonly path = '/threads'
	readonly method = 'post' as const
	readonly description = 'Attach a contact/group to a workspace + providers (C09)'
	readonly inputSchema = AttachThreadControllerInputSchema
	readonly outputSchema = AttachThreadControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private attachThread: AttachThread) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.attachThread.execute({
			ownerId: request.ctx.ownerId,
			contactRef: request.body.contactRef,
			workspaceId: request.body.workspaceId,
			providers: request.body.providers,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}
