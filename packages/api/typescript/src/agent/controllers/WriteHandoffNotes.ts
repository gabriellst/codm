import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { IssueDoorCtxSchema, IssueDoorParamsSchema } from '../types/IssueDoor'
import { WriteHandoffNotes, WriteHandoffNotesInputSchema, WriteHandoffNotesOutputSchema } from '../usecases/WriteHandoffNotes'

export const WriteHandoffNotesControllerInputSchema = z
	.object({
		ctx: IssueDoorCtxSchema,
		params: IssueDoorParamsSchema,
		body: WriteHandoffNotesInputSchema.pick({ notes: true }),
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
export const WriteHandoffNotesControllerOutputSchema = WriteHandoffNotesOutputSchema

/**
 * The issue's session writes its HANDOFF NOTES (fase 4, item 6a) when asked — its context grew past the ask
 * threshold — so the next turn can start a fresh session from them instead of re-reading everything: goal,
 * state, decisions, files and branch, next step. Declared in S0b, wired in S6 (`WriteHandoffNotes` use case).
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
	constructor(private useCase: WriteHandoffNotes) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			issueId: request.params.issueId,
			notes: request.body.notes,
		})
		return { status: HttpStatusCode.ACCEPTED }
	}
}
