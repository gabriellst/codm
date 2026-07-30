import { injectable } from 'tsyringe-neo'
import { BaseError, Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { OpenIssuesReader } from '@thread/services'
import { AgentRunIdentityCtxSchema } from '../types/AgentRunIdentity'
import { MailboxRepository } from '../repositories'
import type { AgentInterfaceErrors } from '../errors'

/**
 * Same `ctx` contract as `ForkIssue`, and COMPOSED from the same single declaration, for the same
 * reason: a value a middleware stamps but the schema never names is STRIPPED by Zod before `handle`
 * sees it.
 */
export const SteerIssueTurnControllerInputSchema = z
	.object({
		ctx: z.object({ ownerId: z.uuid() }).extend(AgentRunIdentityCtxSchema.shape),
		params: z.object({ threadId: z.uuid(), issueId: z.uuid() }),
		body: z.object({
			/** The new instruction for work already in flight. */
			text: z.string().trim().min(1).max(2000),
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
			params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', issueId: '019e4d24-6524-7041-9e1c-8108180cddaf' },
			body: { text: 'prefira o refactor menor' },
		},
	])

export const SteerIssueTurnControllerOutputSchema = z
	.object({ issueId: z.uuid(), queued: z.boolean() })
	.example([{ issueId: '019e4d24-6524-7041-9e1c-8108180cddaf', queued: true }])

/**
 * `SteerIssueTurn` — the orchestrator redirects work already in flight (D7, §7.7).
 *
 * ### Why this is not the console's `SteerIssue`
 * That one lives at `/issues/:issueId/steer`, takes no `threadId`, and writes a terminal line. Under an
 * `orchestration` token it would be UNCONFINED — such an identity carries no `issueId` at all, and
 * `compareIdentity` reads the keys the IDENTITY has, so there is nothing to compare `issueId` against
 * and every issue in the database would be reachable by id. The ownership check in `handle()` below is
 * what closes that, and it is the canonical example of spec decision 4: a controller confines what its
 * identity does not. The class name is also the wire tool name, so the two could not share one anyway.
 *
 * ### What makes a steer safe against a running turn
 * Nothing here interrupts anything. It ENQUEUES, and the dispatcher's per-target lease decides when the
 * item runs — if the subagent is mid-turn, the steer simply waits for the lease. That is why §7.7 can
 * promise "sem corrida, sem retry-throw": the queue is the synchronisation, not this handler.
 */
@injectable()
export class SteerIssueTurnController extends Controller<
	typeof SteerIssueTurnControllerInputSchema,
	typeof SteerIssueTurnControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.orchestration]
	readonly path = '/threads/:threadId/issues/:issueId/steer'
	readonly method = 'post' as const
	readonly description = 'Redirect an issue that is already being worked, mid-flight'
	readonly inputSchema = SteerIssueTurnControllerInputSchema
	readonly outputSchema = SteerIssueTurnControllerOutputSchema
	// `OperatorMiddleware` answers "who is this daemon" (`ctx.ownerId`). "Which run is speaking" is no
	// longer listed: `static mcpScopes` above makes `AgentIdentityMiddleware` mandatory, appended by
	// `Controller.executeMiddlewares`. A tool-callable door cannot be built without it.
	override middlewares = [OperatorMiddleware]

	constructor(
		private readonly openIssues: OpenIssuesReader,
		private readonly mailbox: MailboxRepository,
	) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const { threadId, issueId } = request.params
		const identity = request.ctx.agentIdentity

		// FAIL-CLOSED HERE, not in the middleware: it serves 32 controllers and 23 of them are console
		// reads a human operator makes with no run anywhere. This door is reachable only from inside an
		// orchestrator run, so an absent identity is a broken invariant rather than an anonymous caller.
		if (!identity) {
			throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_TOKEN_INVALID', 'this operation is only reachable from inside an agent run')
		}

		// The run may only steer its OWN thread. `compareIdentity` already agrees with this line, because
		// an `orchestration` identity DOES carry `threadId`; it is kept because the rule is that a
		// controller confines what its identity does not, and a future scope may drop the axis.
		if (identity.threadId !== threadId) {
			throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', 'this run is not attached to that thread')
		}

		// …and the issue must belong to that thread — THE ownership check spec decision 4 makes a
		// requirement, asserted here precisely because the identity carries no `issueId` for the generic
		// comparison to read. Read through the thread's OWN open-issue seam rather than by issue id, so
		// "is it yours" and "is it open" are one question. A closed or foreign issue is refused
		// identically — answering differently would make this an oracle for issue ids.
		const open = await this.openIssues.openIssues(threadId)
		if (!open.some(issue => issue.issueId === issueId)) {
			throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', 'no open issue with that id on this thread')
		}

		const target = open.find(issue => issue.issueId === issueId)
		const queued = await this.mailbox.enqueue({
			ownerId: request.ctx.ownerId,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind: MailboxItemKind.STEER,
			payload: { issueId, threadId, key: target?.key ?? '', title: target?.title ?? '', text: request.body.text },
			// The ENTRY the orchestrator was answering when it decided to steer. Two different steers from
			// two different turns are two items; the same turn retried is one.
			dedupKey: `steer:${identity.entryId ?? issueId}:${issueId}`,
		})

		return { status: HttpStatusCode.ACCEPTED, data: { issueId, queued } }
	}
}
