import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope, StopKind } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { DeclareStop, DeclareStopInputSchema, DeclareStopOutputSchema } from '../usecases/DeclareStop'

export const RaiseStopControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: DeclareStopInputSchema.pick({ threadId: true, issueId: true }),
		body: DeclareStopInputSchema.omit({ ownerId: true, threadId: true, issueId: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
			body: { kind: StopKind.APPROVAL_NEEDED, detail: 'This deletes 3 production tables — confirm before I run it.' },
		},
	])
export const RaiseStopControllerOutputSchema = DeclareStopOutputSchema.example([{ stopId: '019e4d24-6524-7041-9e1c-8108180cdda0' }])

/**
 * Declare that the agent is blocked and needs the human. "Asking for approval" is the
 * `APPROVAL_NEEDED` case of THIS operation — the model picks the kind, which is the entire difference
 * between this and `AskOperator`, whose kind is fixed by its handler and absent from its schema.
 *
 * The transport half of `StopKind` (`AUTH_REQUIRED` / `SERVER_ERROR`) is rejected by the use case,
 * not narrowed here: narrowing would mean redeclaring a value-set contracts owns, which §8 rule 5
 * forbids, and would put a second (silently drifting) copy of the partition in the wire schema.
 */
@injectable()
export class RaiseStopController extends Controller<typeof RaiseStopControllerInputSchema, typeof RaiseStopControllerOutputSchema> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.ISSUE_HANDLING, McpScope.orchestration]
	readonly path = '/threads/:threadId/issues/:issueId/stops'
	readonly method = 'post' as const
	readonly description = 'Declare that the agent is blocked and needs the human (approval, classification, …)'
	readonly inputSchema = RaiseStopControllerInputSchema
	readonly outputSchema = RaiseStopControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: DeclareStop) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			issueId: request.params.issueId,
			...request.body,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}
