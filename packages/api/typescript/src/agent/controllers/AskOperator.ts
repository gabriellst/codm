import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { AskOperator, AskOperatorInputSchema, AskOperatorOutputSchema } from '../usecases/AskOperator'

export const AskOperatorControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: AskOperatorInputSchema.pick({ threadId: true, issueId: true }),
		// EXACTLY `{ question }` — and the absence of `kind` is the contract, not an omission. The
		// generated tool's `inputSchema` is derived from this object, so "the model cannot choose the
		// kind here" is a structural property of the emitted schema rather than a rule somebody has to
		// remember (AC-6.10(c)).
		body: AskOperatorInputSchema.pick({ question: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
			body: { question: 'Should the refund be full or partial for orders older than 90 days?' },
		},
	])
export const AskOperatorControllerOutputSchema = AskOperatorOutputSchema.example([
	{ delivered: true, stopId: '019e4d24-6524-7041-9e1c-8108180cdda0' },
])

/**
 * Ask the human a question, FIRE-AND-FORGET. It returns as soon as the question is durable and never
 * waits for an answer: on a night with nobody awake a blocking tool would hang the run until the
 * watchdog, and the operator would wake to a dead run instead of a question.
 *
 * The question lands as a `HUMAN_REQUESTED` stop, so it appears on the Needs-you card the product
 * already renders — with the question itself as the card's title, because
 * `MaterializeIssueFromExecution` promotes `detail` to `title` for that one kind.
 */
@injectable()
export class AskOperatorController extends Controller<typeof AskOperatorControllerInputSchema, typeof AskOperatorControllerOutputSchema> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.ISSUE_HANDLING, McpScope.orchestration]
	readonly path = '/threads/:threadId/issues/:issueId/operator-questions'
	readonly method = 'post' as const
	readonly description = 'Ask the operator a question (fire-and-forget; surfaces as a Needs-you stop)'
	readonly inputSchema = AskOperatorControllerInputSchema
	readonly outputSchema = AskOperatorControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: AskOperator) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			issueId: request.params.issueId,
			question: request.body.question,
		})
		return { status: HttpStatusCode.ACCEPTED, data }
	}
}
