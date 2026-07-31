import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { AgentRunIdentityCtxSchema } from '@agent/types/AgentRunIdentity'
import type { AgentInterfaceErrors } from '@agent/errors'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ResolveStop, ResolveStopInputSchema, ResolveStopOutputSchema } from '../usecases/ResolveStop'

/**
 * `agentIdentity` is COMPOSED here, from the one declaration, for the reason that file states: a value
 * `AgentIdentityMiddleware` stamps on `ctx` but no schema names is STRIPPED by Zod before `handle` sees
 * it. It stays OPTIONAL — the console operator carries no run, and this door is both callers.
 */
export const ResolveStopControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }).extend(AgentRunIdentityCtxSchema.shape),
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
 *
 * ### Why `handle()` confines the stop itself
 * The generic comparison cannot: an `orchestration` identity confines `threadId`, and this request
 * carries `{ stopId, resolution }` — `compareIdentity` walks the keys the IDENTITY has and finds none of
 * them in `{...params, ...body}`, so it has nothing to disagree with and admits the call. Until the
 * ownership check below, a run of thread A could close a stop of thread B by naming its uuid. This is
 * spec decision 4 — "a controller confines what its identity does not" — and the shape is
 * `SteerIssueTurnController`'s, line for line.
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
	constructor(
		private useCase: ResolveStop,
		private readonly threads: ThreadRepository,
	) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const identity = request.ctx.agentIdentity

		// NOT fail-closed, and that is the whole difference from `SteerIssueTurn`: that door exists only
		// inside a run, this one is ALSO the console's button. An absent identity means the operator, who
		// is already answered for by `OperatorMiddleware` and by the use case's own tenancy check.
		if (identity) {
			// Read through the thread's OWN open-stop seam rather than by stop id, so "is it yours" and "is
			// it still open" are ONE question — the same posture `SteerIssueTurn` takes on issues. A stop of
			// another thread and an already-answered stop of this one are refused identically; answering
			// differently would make this an oracle for stop ids. The console path keeps the precise
			// `STOP_ALREADY_RESOLVED` / `STOP_NOT_FOUND` verdicts, because the guard never runs for it.
			const open = await this.threads.openStops(identity.threadId)
			if (!open.some(stop => stop.stopId === request.params.stopId)) {
				throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', 'no open stop with that id on this thread')
			}
		}

		await this.useCase.execute({ ownerId: request.ctx.ownerId, stopId: request.params.stopId, resolution: request.body.resolution })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
