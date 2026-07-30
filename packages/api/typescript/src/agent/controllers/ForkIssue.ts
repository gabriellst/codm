import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { ThreadRepository } from '@thread/repositories'
import { RunTokenMiddleware } from '../middlewares'
import { ForkIssue, ForkIssueOutputSchema } from '../usecases/ForkIssue'
import type { AgentApplicationErrors, AgentInterfaceErrors } from '../errors'

/**
 * The body is `{ goal }` and NOTHING else — which is §7.2's whole point.
 *
 * `originEntryId` is absent because `RunTokenMiddleware` injects it from the run token's claims;
 * `provider` is absent because it is a property of the THREAD, not a choice the model gets; `threadId`
 * is a path param the MCP router already walks against the claims (AC-6.6). What remains is the one
 * value only the operator's own words can supply.
 */
/**
 * The run's identity, as `RunTokenMiddleware` stamps it onto `ctx`.
 *
 * IT MUST BE DECLARED HERE. The controller base validates the whole request against `inputSchema`,
 * and zod objects STRIP unknown keys — so a value a middleware injected but the schema never named is
 * silently removed before `handle` ever sees it. That is not a hypothetical: it cost a 500 on every
 * fork, `claims` arriving `undefined` and `claims.threadId` throwing, with the middleware itself
 * provably correct. Nothing warned; the key was simply gone.
 */
const RunClaimsCtxSchema = z.object({
	threadId: z.uuid(),
	entryId: z.uuid().optional(),
})

export const ForkIssueControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid(), runClaims: RunClaimsCtxSchema }),
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
				runClaims: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', entryId: '019e4d24-6524-7041-9e1c-8108180cddb0' },
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
 * ### Two middlewares, two different questions
 * `OperatorMiddleware` answers "who is this daemon" (`ctx.ownerId`). `RunTokenMiddleware` answers
 * "which run is speaking" (`ctx.runClaims`), and is what makes `originEntryId` unforgeable.
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
	override middlewares = [OperatorMiddleware, RunTokenMiddleware]

	constructor(
		private readonly useCase: ForkIssue,
		private readonly threads: ThreadRepository,
	) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const claims = request.ctx.runClaims
		const threadId = request.params.threadId

		// T2f — THREAD OWNERSHIP, asserted HERE because the generic guard structurally cannot.
		// `assertIdentityMatchesClaims` compares an argument only when the matching claim is non-empty,
		// and an `orchestration` token deliberately carries no `issueId` (§7.2.1). `threadId` is the axis
		// that still confines this call, and it is checked rather than assumed: the walker would wave
		// through a threadId it had nothing to compare against if the claim were ever dropped.
		if (claims.threadId !== threadId) {
			throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', 'this run is not attached to that thread')
		}

		// The entry the operator's request arrived on. Its absence is a BROKEN INVARIANT, not a missing
		// optional: an orchestrator turn is scheduled by a mailbox item that always carries one, so a
		// token without it means the claim was minted outside that path. Failing loudly beats forking an
		// issue whose finished answer would have nothing to quote.
		if (!claims.entryId) {
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
			originEntryId: claims.entryId,
			provider,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}
