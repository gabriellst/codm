import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { RemoveWorkspace } from '../usecases/RemoveWorkspace'

export const RemoveWorkspaceControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: z.object({ workspaceId: z.uuid() }),
	})
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, params: { workspaceId: '019e4d24-6524-7041-9e1c-8108180cddae' } }])

export const RemoveWorkspaceControllerOutputSchema = z.void()

@injectable()
export class RemoveWorkspaceController extends Controller<
	typeof RemoveWorkspaceControllerInputSchema,
	typeof RemoveWorkspaceControllerOutputSchema
> {
	readonly path = '/workspaces/:workspaceId'
	readonly method = 'delete' as const
	readonly description = 'Remove a registered workspace (refused while an issue is WORKING on it)'
	readonly inputSchema = RemoveWorkspaceControllerInputSchema
	readonly outputSchema = RemoveWorkspaceControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private removeWorkspace: RemoveWorkspace) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.removeWorkspace.execute({ ownerId: request.ctx.ownerId, workspaceId: request.params.workspaceId })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
