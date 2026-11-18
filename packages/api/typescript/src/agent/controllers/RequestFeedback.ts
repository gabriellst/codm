import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { FEEDBACK_ARTIFACTS_MAX, ISSUE_SIGNAL_TEXT_MAX, IssueDoorCtxSchema, IssueDoorParamsSchema } from '../types/IssueDoor'
import type { ApplicationErrors } from '../errors'

export const RequestFeedbackControllerInputSchema = z
	.object({
		ctx: IssueDoorCtxSchema,
		params: IssueDoorParamsSchema,
		body: z.object({
			text: z.string().trim().min(1).max(ISSUE_SIGNAL_TEXT_MAX),
			/** The preview sent to the group — an artifact this issue recorded. */
			mainArtifactId: z.uuid(),
			/** Every artifact the feedback cites (the main one included); the others stay on the panel. */
			artifactIds: z.array(z.uuid()).max(FEEDBACK_ARTIFACTS_MAX),
		}),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
			body: {
				text: 'Preview of the new landing page',
				mainArtifactId: '019e4d24-6524-7041-9e1c-8108180cdda2',
				artifactIds: ['019e4d24-6524-7041-9e1c-8108180cdda2', '019e4d24-6524-7041-9e1c-8108180cdda3'],
			},
		},
	])
export const RequestFeedbackControllerOutputSchema = z.void()

/**
 * The issue shows the group a preview to look at (fase 3, item 1) — a FEEDBACK signal: the main artifact
 * reaches the group, the others the panel. NOT a stop: it does not hold the issue.
 *
 * DECLARED, NOT YET WIRED (slice S0b): the tool exists on the MCP surface and the HTTP contract; the use
 * case lands in S5a. Until then it refuses with `OUTPUT_POLICY_NOT_READY`.
 */
@injectable()
export class RequestFeedbackController extends Controller<
	typeof RequestFeedbackControllerInputSchema,
	typeof RequestFeedbackControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.ISSUE_HANDLING]
	readonly path = '/threads/:threadId/issues/:issueId/feedback'
	readonly method = 'post' as const
	readonly description =
		'Show the group a preview to look at (one main artifact this task recorded, plus the others for the panel). Does not hold the task.'
	readonly inputSchema = RequestFeedbackControllerInputSchema
	readonly outputSchema = RequestFeedbackControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	async handle(_request: this['input']): Promise<this['output']> {
		throw new BaseError<ApplicationErrors>('OUTPUT_POLICY_NOT_READY', 'RequestFeedback lands in fase 3, slice S5a')
	}
}
