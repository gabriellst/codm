import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { WorkspaceBadge } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { AddWorkspace } from '../usecases/AddWorkspace'

export const AddWorkspaceControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		body: z.object({ path: z.string().trim().min(1) }),
	})
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, body: { path: '/Users/dev/acme-api' } }])

export const AddWorkspaceControllerOutputSchema = z
	.object({
		workspaceId: z.uuid(),
		badges: z.array(z.enum(WorkspaceBadge)),
	})
	.example([{ workspaceId: '019e4d24-6524-7041-9e1c-8108180cddae', badges: [WorkspaceBadge.GIT, WorkspaceBadge.CLAUDE_PROJECT] }])

@injectable()
export class AddWorkspaceController extends Controller<typeof AddWorkspaceControllerInputSchema, typeof AddWorkspaceControllerOutputSchema> {
	readonly path = '/workspaces'
	readonly method = 'post' as const
	readonly description = 'Register a local project folder; auto-detects git / Claude-project badges'
	readonly inputSchema = AddWorkspaceControllerInputSchema
	readonly outputSchema = AddWorkspaceControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private addWorkspace: AddWorkspace) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.addWorkspace.execute({ ownerId: request.ctx.ownerId, path: request.body.path })
		return { status: HttpStatusCode.CREATED, data }
	}
}
