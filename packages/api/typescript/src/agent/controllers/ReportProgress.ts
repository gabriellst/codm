import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { ISSUE_SIGNAL_TEXT_MAX, IssueDoorCtxSchema, IssueDoorParamsSchema } from '../types/IssueDoor'
import type { ApplicationErrors } from '../errors'

export const ReportProgressControllerInputSchema = z
	.object({
		ctx: IssueDoorCtxSchema,
		params: IssueDoorParamsSchema,
		body: z.object({ text: z.string().trim().min(1).max(ISSUE_SIGNAL_TEXT_MAX) }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
			body: { text: 'Built the page and ran the checks; deploying the preview next.' },
		},
	])
export const ReportProgressControllerOutputSchema = z.void()

/**
 * The issue records what it did (fase 3, item 1) — a PROGRESS signal: the task's timeline and panel, and
 * the group only when it chose the EVERYTHING mode.
 *
 * DECLARED, NOT YET WIRED (slice S0b): the tool exists on the MCP surface and the HTTP contract; the use
 * case lands in S5a. Until then it refuses with `OUTPUT_POLICY_NOT_READY`.
 */
@injectable()
export class ReportProgressController extends Controller<
	typeof ReportProgressControllerInputSchema,
	typeof ReportProgressControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.ISSUE_HANDLING]
	readonly path = '/threads/:threadId/issues/:issueId/progress'
	readonly method = 'post' as const
	readonly description = "Record what you did on this task — it goes to the task's timeline, not to the group."
	readonly inputSchema = ReportProgressControllerInputSchema
	readonly outputSchema = ReportProgressControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	async handle(_request: this['input']): Promise<this['output']> {
		throw new BaseError<ApplicationErrors>('OUTPUT_POLICY_NOT_READY', 'ReportProgress lands in fase 3, slice S5a')
	}
}
