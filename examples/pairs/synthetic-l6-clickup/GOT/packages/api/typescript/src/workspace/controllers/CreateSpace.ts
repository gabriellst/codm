import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { CreateSpace } from '../usecases/CreateSpace'

export const CreateSpaceControllerInputSchema = z.object({
	body: z.object({
		name: z.string().min(1),
	}),
	ctx: z.object({
		session: z.object({ storeId: z.uuid() }),
	}),
})

export const CreateSpaceControllerOutputSchema = z.object({
	spaceId: z.uuid(),
})

@injectable()
export class CreateSpaceController extends Controller<
	typeof CreateSpaceControllerInputSchema,
	typeof CreateSpaceControllerOutputSchema
> {
	readonly path = '/spaces'
	readonly method = 'post' as const
	readonly description = 'Create a space within the store workspace'
	readonly inputSchema = CreateSpaceControllerInputSchema
	readonly outputSchema = CreateSpaceControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private useCase: CreateSpace) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const { spaceId } = await this.useCase.execute({
			workspaceId: request.ctx.session.storeId,
			name: request.body.name,
		})
		return { status: HttpStatusCode.OK, data: { spaceId } }
	}
}
