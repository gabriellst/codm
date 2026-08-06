import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { MailboxItemKind, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { RunIssueTurn } from '../usecases/RunIssueTurn'

export const TestRunIssueTurnInputSchema = z.object({
	ctx: z.object({ ownerId: z.uuid() }),
	body: z.object({
		issueId: z.uuid(),
		threadId: z.uuid(),
		key: z.string().trim().min(1),
		title: z.string().trim().min(1),
		workspacePath: z.string().trim().min(1),
		prompt: z.string().trim().min(1),
		provider: z.enum(ProviderKind).default(ProviderKind.CLAUDE_CODE),
	}),
})

export const TestRunIssueTurnOutputSchema = z.object({
	issueId: z.uuid(),
	outcome: z.string(),
})

/**
 * TEST-ONLY door that runs ONE agent turn against an issue the caller already knows.
 *
 * ### Why the e2e needs it, and why nothing softer works
 * `AgentStreamRegistry.send` drops every frame when no observer is attached — deliberately, since a
 * headless run must not buffer transport for a browser that may never arrive. So a spec that wants to
 * WATCH a run has to be attached first, and on the production path it cannot be: the issue id is
 * minted inside `RunIssueTurnOnClassification`, in the same tick that calls `RunIssueTurn`, so by the
 * time any read can name the issue, the run that would have streamed to it is over.
 *
 * Two alternatives were built and MEASURED before this one. Holding the run at a rendezvous until the
 * panel attached deadlocks by construction: `RunIssueTurn` is invoked BY the outbox dispatcher, so a
 * parked run parks the dispatcher, and the `issue.opened` fact the spec is polling for cannot be
 * delivered until the hold ends — measured at 20s to materialize against a 15s hold. Waiting for the
 * first run to finish and re-running the same issue works, but re-declares a completion on an already
 * COMPLETED issue, which puts a losing `CompleteIssue` in the dispatcher's retry path.
 *
 * So the spec opens its own issue through the REAL `CreateIssue` endpoint, attaches the panel to it,
 * and asks for a turn. The turn itself is the real use case, driven the real way — same DI graph, same
 * agent, same stub runner, same MCP round trip, same SSE registry. What this door replaces is only the
 * TRIGGER, exactly like the Go gateway's `POST /api/channel/_test/connect` replaces a pairing.
 *
 * Mounted ONLY under `CODM_E2E` (`agent/index.ts`), refused under NODE_ENV=production by
 * `src/boot/assert-e2e-safe.ts`, and never emitted to the SDK/OpenAPI — emission runs with
 * `EMIT_OPENAPI=true`, where `CODM_E2E` is unset, so this controller is not in the map the emitter
 * walks. Same discipline as `McpDoorController` beside it.
 *
 * It lives in the `agent` context, not beside the gateway simulator in `shared/`, because the use case
 * it drives is an `agent` use case: a door in `shared/` would make the root context import a leaf's
 * write model, the direction `bun detect`'s import-direction rail exists to keep shut.
 */
@injectable()
export class TestRunIssueTurnController extends Controller<typeof TestRunIssueTurnInputSchema, typeof TestRunIssueTurnOutputSchema> {
	readonly path = '/_test/agent/run-turn'
	readonly method = 'post' as const
	readonly description = 'TEST-ONLY: run one agent turn against an existing issue'
	readonly inputSchema = TestRunIssueTurnInputSchema
	readonly outputSchema = TestRunIssueTurnOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private readonly runIssueTurn: RunIssueTurn) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const result = await this.runIssueTurn.execute({
			ownerId: request.ctx.ownerId,
			...request.body,
			// This door hands the agent a BRIEF — it is how an e2e triggers a turn from nothing, so there is
			// no work in flight for a steer to amend. Stated rather than defaulted: the discriminant now
			// changes how the working prompt reads the message, and "whatever the schema falls back to" is
			// not a decision anybody made.
			turnKind: MailboxItemKind.WORK,
			// The turn's cursor. A fresh id rather than a transcript entry: this door exists to trigger a
			// turn, and inventing a link to a message that was never routed here would be a lie the
			// resume guard would later read as truth.
			messageId: uuidv7(),
		})
		return { status: HttpStatusCode.OK, data: { issueId: result.issueId, outcome: result.outcome } }
	}
}
