import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { ThreadRepository } from '@thread/repositories'
import { AgentRunIdentityCtxSchema } from '../types/AgentRunIdentity'
import { ForkIssue, ForkIssueOutputSchema } from '../usecases/ForkIssue'
import type { AgentApplicationErrors, AgentInterfaceErrors } from '../errors'

/**
 * The body is `{ goal }` and NOTHING else — which is §7.2's whole point.
 *
 * `originEntryId` is absent because `AgentIdentityMiddleware`, auto-applied by the `static mcpScopes`
 * below, resolves the run's identity and stamps it on `ctx`; `provider` is absent because it is a
 * property of the THREAD, not a choice the model gets; `threadId` is a path param the same middleware
 * already compares against the identity. What remains is the one value only the operator's own words
 * can supply.
 *
 * The `ctx` shape is COMPOSED rather than re-declared: `AgentRunIdentityCtxSchema` states once what
 * the middleware stamps, and it must be stated at all because Zod objects STRIP unknown keys — a value
 * a middleware injected but no schema named is silently removed before `handle` ever sees it.
 */
export const ForkIssueControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }).extend(AgentRunIdentityCtxSchema.shape),
		params: z.object({ threadId: z.uuid() }),
		body: z.object({
			/** What the operator asked for, in their words. Becomes the subagent's prompt and the issue title. */
			goal: z.string().trim().min(1).max(2000),
		}),
	})
	.example([
		{
			ctx: {
				ownerId: '00000000-0000-4000-8000-000000000001',
				agentIdentity: {
					ownerId: '00000000-0000-4000-8000-000000000001',
					threadId: '019e4d24-6524-7041-9e1c-8108180cddae',
					entryId: '019e4d24-6524-7041-9e1c-8108180cddb0',
					scope: McpScope.orchestration,
				},
			},
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
			body: { goal: 'põe um toggle de dark mode nas configurações' },
		},
	])

export const ForkIssueControllerOutputSchema = ForkIssueOutputSchema.example([
	{ issueId: '019e4d24-6524-7041-9e1c-8108180cddaf', key: 'poe-um-toggle-de-dark-mode-nas' },
])

/**
 * `ForkIssue` — the MCP tool the orchestrator calls when the operator asks for work out loud (D1/D4).
 *
 * ### Why a NEW controller rather than reusing `CreateIssueController`
 * The controller CLASS NAME is the wire tool name (`operationIdOf` strips `Controller`), and
 * `CreateIssue` is already taken by the `issue-handling` scope. The collision is the shallow reason;
 * the real one is that the existing door takes `{ title, provider }` and declares work an agent
 * separated out MID-RUN, which is a different act. This one takes `{ goal }` and is the birth of an
 * issue nobody was working yet.
 *
 * ### Two middlewares, two different questions — and only one of them is LISTED
 * `OperatorMiddleware` answers "who is this daemon" (`ctx.ownerId`) and is opted into, because that is
 * a routing choice. "Which run is speaking" is not a choice: `static mcpScopes` below makes
 * `AgentIdentityMiddleware` mandatory, appended by `Controller.executeMiddlewares`, and it is what
 * stamps `ctx.agentIdentity` and makes `originEntryId` unforgeable.
 */
@injectable()
export class ForkIssueController extends Controller<typeof ForkIssueControllerInputSchema, typeof ForkIssueControllerOutputSchema> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.orchestration]
	readonly path = '/threads/:threadId/issues/fork'
	readonly method = 'post' as const
	readonly description = "Fork a new issue out of the conversation, from the operator's own words"
	readonly inputSchema = ForkIssueControllerInputSchema
	readonly outputSchema = ForkIssueControllerOutputSchema
	// `OperatorMiddleware` answers "who is this daemon" (`ctx.ownerId`). "Which run is speaking" is no
	// longer listed: `static mcpScopes` above makes `AgentIdentityMiddleware` mandatory, appended by
	// `Controller.executeMiddlewares`. A tool-callable door cannot be built without it.
	override middlewares = [OperatorMiddleware]

	constructor(
		private readonly useCase: ForkIssue,
		private readonly threads: ThreadRepository,
	) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const identity = request.ctx.agentIdentity
		const threadId = request.params.threadId

		// FAIL-CLOSED HERE, not in the middleware. `AgentIdentityMiddleware` serves 32 controllers and 23
		// of them are console reads a human operator makes with no run anywhere — refusing an absent
		// token there would take the console down to protect a surface no agent is calling. For THIS
		// door the absence is a broken invariant: it is reachable only from inside an orchestrator run,
		// and an issue forked with no run behind it has no provenance for its eventual answer to quote.
		if (!identity) {
			throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_TOKEN_INVALID', 'this operation is only reachable from inside an agent run')
		}

		// THREAD OWNERSHIP, asserted HERE because the generic comparison structurally cannot cover the
		// axis this scope does not carry. `compareIdentity` reads the keys the IDENTITY has, and an
		// `orchestration` identity deliberately has no `issueId`. `threadId` IS carried, so the generic
		// check already agrees with this line — it is kept because the rule of spec decision 4 is that a
		// controller confines what its identity does not, and a future scope may drop this axis too.
		if (identity.threadId !== threadId) {
			throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', 'this run is not attached to that thread')
		}

		// The entry the operator's request arrived on. Its absence is a BROKEN INVARIANT, not a missing
		// optional: an orchestrator turn is scheduled by a mailbox item that always carries one, so an
		// identity without it was issued outside that path. Failing loudly beats forking an issue whose
		// finished answer would have nothing to quote.
		if (!identity.entryId) {
			throw new BaseError<AgentApplicationErrors>(
				'AGENT_TOOLS_UNSUPPORTED',
				'this run carries no originating message to attribute the issue to',
			)
		}

		// A thread that vanished between minting and this call. Reported as a SCOPE failure rather than a
		// new error code: the run is confined to a thread that no longer resolves, so the call is out of
		// scope in the most literal sense. (The sibling handler `RunIssueTurnOnClassification` drops
		// silently on the same condition — correct for an event handler, impossible for a door that owes
		// the caller an answer.)
		const thread = await this.threads.findById(threadId)
		if (!thread) throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', 'the thread this run is scoped to no longer exists')

		const provider = thread.providers[0]
		if (!provider) throw new BaseError<AgentApplicationErrors>('PROVIDER_NOT_DETECTED', 'this thread has no provider bound')

		const data = await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId,
			goal: request.body.goal,
			originEntryId: identity.entryId,
			provider,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}
