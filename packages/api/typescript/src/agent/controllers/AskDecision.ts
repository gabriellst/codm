import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, z } from '@codm/core-typescript'
import { AskEffect, McpScope } from '@codm/contracts-typescript/wire/enums'
import { ASK_OPTIONS_MAX, AskOptionSchema, StopAskSchema } from '@shared/objects'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { IssueDoorCtxSchema, IssueDoorParamsSchema } from '../types/IssueDoor'
import type { ApplicationErrors } from '../errors'

export const AskDecisionControllerInputSchema = z
	.object({
		ctx: IssueDoorCtxSchema,
		params: IssueDoorParamsSchema,
		// A decision has no default and no deadline: it holds the issue until someone answers. Two to six
		// options; `effects` is required (may be empty) so the model always states what the answer authorizes.
		body: StopAskSchema.pick({ question: true, effects: true, addresseeId: true }).extend({
			options: z.array(AskOptionSchema).min(2).max(ASK_OPTIONS_MAX),
		}),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
			body: {
				question: 'The preview is ready. Publish it?',
				options: [
					{ id: 'yes', label: 'Publish' },
					{ id: 'no', label: 'Not yet' },
				],
				effects: [AskEffect.PUBLISH],
			},
		},
	])
export const AskDecisionControllerOutputSchema = z.object({ stopId: z.uuid() })

/**
 * The issue asks the group to DECIDE (fase 3, item 1) — a stop `DECISION_REQUESTED` that holds the issue
 * until someone answers; with a declared effect only someone who may release can answer it.
 *
 * DECLARED, NOT YET WIRED (slice S0b): the tool exists on the MCP surface and the HTTP contract; the use
 * case lands in S5a. Until then it refuses with `OUTPUT_POLICY_NOT_READY`.
 */
@injectable()
export class AskDecisionController extends Controller<typeof AskDecisionControllerInputSchema, typeof AskDecisionControllerOutputSchema> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.ISSUE_HANDLING]
	readonly path = '/threads/:threadId/issues/:issueId/decisions'
	readonly method = 'post' as const
	readonly description =
		'Ask the group for a decision you cannot go on without (2–6 options; declare every effect the answer authorizes). Holds the task until someone answers.'
	readonly inputSchema = AskDecisionControllerInputSchema
	readonly outputSchema = AskDecisionControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	async handle(_request: this['input']): Promise<this['output']> {
		throw new BaseError<ApplicationErrors>('OUTPUT_POLICY_NOT_READY', 'AskDecision lands in fase 3, slice S5a')
	}
}
