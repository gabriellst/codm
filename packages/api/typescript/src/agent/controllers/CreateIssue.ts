import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { McpScope, ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { DeclareIssueOpen, DeclareIssueOpenInputSchema, DeclareIssueOpenOutputSchema } from '../usecases/DeclareIssueOpen'

// Body COMPOSED from the use-case input (single source), minus the envelope: `ownerId` comes from the
// middleware and `threadId` from the path. Same shape as `RecordArtifactController`, deliberately —
// these are the same kind of door.
export const CreateIssueControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: DeclareIssueOpenInputSchema.pick({ threadId: true }),
		body: DeclareIssueOpenInputSchema.omit({ ownerId: true, threadId: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
			body: { title: 'Pix payment bug', provider: ProviderKind.CLAUDE_CODE },
		},
	])
export const CreateIssueControllerOutputSchema = DeclareIssueOpenOutputSchema.example([
	{ issueId: '019e4d24-6524-7041-9e1c-8108180cddaf', key: 'pix-payment-bug' },
])

/**
 * Open a new issue on a thread. Born in Fase 6 because until now an issue could ONLY materialize as a
 * side effect of a run starting — an agent that discovered a second, separable unit of work had no way
 * to say so, and neither did the console.
 *
 * It is an ORDINARY controller: it enters the SDK and the emitted spec like any other. That it is also
 * an MCP tool is declared by its OWN `static mcpScopes` right below — the founder amendment that put
 * "what can a model call?" in the file a reviewer is already reading, in the idiom `middlewares` uses.
 */
@injectable()
export class CreateIssueController extends Controller<typeof CreateIssueControllerInputSchema, typeof CreateIssueControllerOutputSchema> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.ISSUE_HANDLING]
	readonly path = '/threads/:threadId/issues'
	readonly method = 'post' as const
	readonly description = 'Open a new issue on a thread'
	readonly inputSchema = CreateIssueControllerInputSchema
	readonly outputSchema = CreateIssueControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: DeclareIssueOpen) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId, ...request.body })
		return { status: HttpStatusCode.CREATED, data }
	}
}
