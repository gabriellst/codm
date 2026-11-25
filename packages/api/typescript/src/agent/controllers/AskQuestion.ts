import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { AskAnswerKind, McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { IssueDoorCtxSchema, IssueDoorParamsSchema } from '../types/IssueDoor'
import { AskQuestion, AskQuestionInputSchema, AskQuestionOutputSchema } from '../usecases/AskQuestion'

export const AskQuestionControllerInputSchema = z
	.object({
		ctx: IssueDoorCtxSchema,
		params: IssueDoorParamsSchema,
		body: AskQuestionInputSchema.omit({ ownerId: true, threadId: true, issueId: true, actingIssueId: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
			body: {
				question: 'Blue or green for the banner background?',
				options: [
					{ id: 'blue', label: 'Blue' },
					{ id: 'green', label: 'Green' },
				],
				default: { kind: AskAnswerKind.OPTION, optionId: 'blue' },
				effects: [],
			},
		},
	])
export const AskQuestionControllerOutputSchema = AskQuestionOutputSchema

/**
 * The issue asks the group a QUESTION it can go on without (fase 3, item 1) — a stop `QUESTION_ASKED`
 * that holds the issue only until its deadline (15 min after the group received it), then the declared
 * default applies. Any declared effect escalates it to a decision.
 */
@injectable()
export class AskQuestionController extends Controller<typeof AskQuestionControllerInputSchema, typeof AskQuestionControllerOutputSchema> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.ISSUE_HANDLING]
	readonly path = '/threads/:threadId/issues/:issueId/questions'
	readonly method = 'post' as const
	readonly description =
		'Ask the group a question you can go on without: declare the default you will follow if nobody answers within 15 minutes. Declaring any effect turns it into a decision. The question: plain words, at most 3 short sentences, no task key or jargon.'
	readonly inputSchema = AskQuestionControllerInputSchema
	readonly outputSchema = AskQuestionControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: AskQuestion) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			issueId: request.params.issueId,
			actingIssueId: request.ctx.agentIdentity?.issueId,
			...request.body,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}
