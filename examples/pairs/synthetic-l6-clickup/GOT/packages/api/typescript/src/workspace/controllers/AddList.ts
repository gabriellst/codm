import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { AddList } from '../usecases/AddList'

export const AddListControllerInputSchema = z.object({
	params: z.object({
		spaceId: z.uuid(),
	}),
	body: z.object({
		name: z.string().min(1),
	}),
	ctx: z.object({
		session: z.object({ storeId: z.uuid() }),
	}),
})

export const AddListControllerOutputSchema = z.object({
	listId: z.uuid(),
})

@injectable()
export class AddListController extends Controller<
	typeof AddListControllerInputSchema,
	typeof AddListControllerOutputSchema
> {
	readonly path = '/spaces/:spaceId/lists'
	readonly method = 'post' as const
	readonly description = 'Add a list to a space'
	readonly inputSchema = AddListControllerInputSchema
	readonly outputSchema = AddListControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private useCase: AddList) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const { listId } = await this.useCase.execute({
			spaceId: request.params.spaceId,
			name: request.body.name,
		})
		return { status: HttpStatusCode.OK, data: { listId } }
	}
}
