import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, z } from '@codm/core-typescript'
import { AskAnswerKind, McpScope, StopKind } from '@codm/contracts-typescript/wire/enums'
import { AskDefaultSchema, StopAskSchema } from '@shared/objects'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { IssueDoorCtxSchema, IssueDoorParamsSchema } from '../types/IssueDoor'
import type { ApplicationErrors } from '../errors'

export const AskQuestionControllerInputSchema = z
	.object({
		ctx: IssueDoorCtxSchema,
		params: IssueDoorParamsSchema,
		// A question MUST carry the default it goes on with — required here, so "a question without a
		// default" is not a value the tool can even receive. `options` may be empty (a free-text question).
		body: StopAskSchema.extend({ default: AskDefaultSchema }),
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
/**
 * `kind` tells the session what the ask became: `QUESTION_ASKED` (goes on with the default after the
 * deadline) or `DECISION_REQUESTED` (a declared effect escalated it — wait for the answer).
 */
export const AskQuestionControllerOutputSchema = z.object({ stopId: z.uuid(), kind: z.enum(StopKind) })

/**
 * The issue asks the group a QUESTION it can go on without (fase 3, item 1) — a stop `QUESTION_ASKED`
 * that holds the issue only until its deadline (15 min after the group received it), then the declared
 * default applies. Any declared effect escalates it to a decision.
 *
 * DECLARED, NOT YET WIRED (slice S0b): the tool exists on the MCP surface and the HTTP contract; the use
 * case lands in S5a. Until then it refuses with `OUTPUT_POLICY_NOT_READY`.
 */
@injectable()
export class AskQuestionController extends Controller<typeof AskQuestionControllerInputSchema, typeof AskQuestionControllerOutputSchema> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.ISSUE_HANDLING]
	readonly path = '/threads/:threadId/issues/:issueId/questions'
	readonly method = 'post' as const
	readonly description =
		'Ask the group a question you can go on without: declare the default you will follow if nobody answers within 15 minutes. Declaring any effect turns it into a decision.'
	readonly inputSchema = AskQuestionControllerInputSchema
	readonly outputSchema = AskQuestionControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	async handle(_request: this['input']): Promise<this['output']> {
		throw new BaseError<ApplicationErrors>('OUTPUT_POLICY_NOT_READY', 'AskQuestion lands in fase 3, slice S5a')
	}
}
