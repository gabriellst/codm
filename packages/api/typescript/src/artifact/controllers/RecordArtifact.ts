import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { ArtifactKind, McpScope } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { RecordArtifact, RecordArtifactInputSchema, RecordArtifactOutputSchema } from '../usecases/RecordArtifact'

// Body COMPOSED from the use case input (single source): everything but the envelope (ownerId from
// the middleware, threadId from the path).
export const RecordArtifactControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: RecordArtifactInputSchema.pick({ threadId: true }),
		body: RecordArtifactInputSchema.omit({ ownerId: true, threadId: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
			body: { kind: ArtifactKind.LINK, name: 'Preview deploy', ref: 'https://preview.example.com', meta: '{}' },
		},
	])
export const RecordArtifactControllerOutputSchema = RecordArtifactOutputSchema.example([
	{ artifactId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
])

// C30
@injectable()
export class RecordArtifactController extends Controller<
	typeof RecordArtifactControllerInputSchema,
	typeof RecordArtifactControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.ISSUE_HANDLING]
	readonly path = '/threads/:threadId/artifacts'
	readonly method = 'post' as const
	readonly description = 'Record a non-code agent output (image / file / link) (C30)'
	readonly inputSchema = RecordArtifactControllerInputSchema
	readonly outputSchema = RecordArtifactControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: RecordArtifact) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId, ...request.body })
		return { status: HttpStatusCode.CREATED, data }
	}
}
