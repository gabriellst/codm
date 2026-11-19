import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { IssueDoorCtxSchema, IssueDoorParamsSchema } from '../types/IssueDoor'
import type { ApplicationErrors } from '../errors'

/** The longest handoff notes a session may write. */
export const HANDOFF_NOTES_MAX = 8000

export const WriteHandoffNotesControllerInputSchema = z
	.object({
		ctx: IssueDoorCtxSchema,
		params: IssueDoorParamsSchema,
		body: z.object({ notes: z.string().trim().min(1).max(HANDOFF_NOTES_MAX) }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
			body: {
				notes:
					'Goal: dark mode toggle. Done: settings page and theme store. Decided: follow the OS by default. Next: persist the choice. Branch: feat/dark-mode.',
			},
		},
	])
export const WriteHandoffNotesControllerOutputSchema = z.void()

/**
 * The issue's session writes its HANDOFF NOTES (fase 4, item 6a) when asked — its context grew past the ask
 * threshold — so the next turn can start a fresh session from them instead of re-reading everything: goal,
 * state, decisions, files and branch, next step.
 *
 * DECLARED, NOT YET WIRED (slice S0b): the tool exists on the MCP surface and the HTTP contract; the use case
 * lands in S6. Until then it refuses with `THROUGHPUT_NOT_READY` — never a 2xx that would tell the session its
 * notes were kept.
 */
@injectable()
export class WriteHandoffNotesController extends Controller<
	typeof WriteHandoffNotesControllerInputSchema,
	typeof WriteHandoffNotesControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.ISSUE_HANDLING]
	readonly path = '/threads/:threadId/issues/:issueId/handoff-notes'
	readonly method = 'post' as const
	readonly description =
		'Write handoff notes for this task (goal, state, decisions, files/branch, next step) — a fresh session will continue from them.'
	readonly inputSchema = WriteHandoffNotesControllerInputSchema
	readonly outputSchema = WriteHandoffNotesControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	async handle(_request: this['input']): Promise<this['output']> {
		throw new BaseError<ApplicationErrors>('THROUGHPUT_NOT_READY', 'WriteHandoffNotes lands in fase 4, slice S6')
	}
}
