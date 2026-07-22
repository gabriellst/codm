import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { ProviderKind, ContactKind } from '@template/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { AttachThread } from '../usecases/AttachThread'

export const AttachThreadControllerInputSchema = z.object({
	ctx: z.object({ ownerId: z.uuid() }),
	body: z.object({
		contactRef: z.object({
			channelId: z.uuid(),
			externalId: z.string().min(1),
			displayName: z.string().min(1),
			kind: z.enum(ContactKind),
		}),
		workspaceId: z.uuid(),
		providers: z.array(z.enum(ProviderKind)).min(1),
	}),
})

export const AttachThreadControllerOutputSchema = z.object({ threadId: z.uuid() })

@injectable()
export class AttachThreadController extends Controller<typeof AttachThreadControllerInputSchema, typeof AttachThreadControllerOutputSchema> {
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
