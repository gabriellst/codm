import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { ResolveStop, ResolveStopInputSchema, ResolveStopOutputSchema } from '../usecases/ResolveStop'

export const ResolveStopControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }),
		params: ResolveStopInputSchema.pick({ stopId: true }),
		body: ResolveStopInputSchema.pick({ resolution: true }),
	})
	.example([
		{
			ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
			params: { stopId: '019e4d24-6524-7041-9e1c-8108180cddb1' },
			body: { resolution: StopResolution.RETRY },
		},
	])
export const ResolveStopControllerOutputSchema = ResolveStopOutputSchema

/**
 * C25 — the operator answers a stop.
 *
 * ### Why it is also an `orchestration` tool (issue-resume spec, decision 1)
 * Half of that decision is "resolve it AND steer the issue with what the operator said", and only the
 * steering half was callable: the orchestrator holds `SteerIssueTurn` but had no way to close the stop
 * it was answering, so a conversation that resumed an issue left the stop open forever and the console
 * kept showing a question that had already been answered. Declaring the scope here is the whole of the
 * missing half — the door, the use case and the invariants are the console's, unchanged.
 *
 * `AgentIdentityMiddleware` is appended automatically by `Controller.executeMiddlewares` because this
 * static is non-empty; it is NOT fail-closed, so the console operator (who carries no run token) keeps
 * reaching the same handler exactly as before.
 */
// C25
@injectable()
export class ResolveStopController extends Controller<typeof ResolveStopControllerInputSchema, typeof ResolveStopControllerOutputSchema> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.orchestration]
	readonly path = '/stops/:stopId/resolve'
	readonly method = 'post' as const
	readonly description = 'Resolve a stop — retry / review&send / take over / approve / deny (C25)'
	readonly inputSchema = ResolveStopControllerInputSchema
	readonly outputSchema = ResolveStopControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: ResolveStop) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, stopId: request.params.stopId, resolution: request.body.resolution })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
