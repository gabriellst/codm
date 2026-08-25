import { singleton } from 'tsyringe-neo'
import { BaseError } from '../types/BaseError'
import type { BaseInterfaceErrors } from '../errors/codes'
import type { HttpControllerRequest, HttpMiddlewareResponse } from '../types/Http'
import type { Middleware } from '../types/Middleware'
import { AgentIdentityService } from '../services/AgentIdentityService'
import { compareIdentity, readAgentRunToken } from '../types/AgentIdentity'

/**
 * THE DESTINATION-SIDE IDENTITY CHECK — auto-applied to every controller that declares `mcpScopes`
 * (B2, spec decision 4). It replaces BOTH the per-controller `RunTokenMiddleware` and the generic
 * argument walk the MCP door used to run over the JSON-RPC body.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * IT IS NOT LISTED IN `middlewares`, AND THAT IS THE POINT
 * `CloudSessionMiddleware` is opted into per controller because "who is this daemon" is a routing choice.
 * This one is not a choice: a controller that declared itself reachable as a model-callable tool has
 * ALREADY said the dangerous thing, and requiring a second, separate line to protect it means the
 * protection can be forgotten exactly where it matters. `Controller.executeMiddlewares` appends it
 * whenever `static mcpScopes` is non-empty — chosen over `MainRouter` because MainRouter is skippable
 * (emission never runs it, and a test that calls `executeController` directly bypasses it), and a
 * security boundary with a bypass is not one.
 *
 * NOT FAIL-CLOSED ON A MISSING TOKEN, DELIBERATELY
 * `system`-scope operations are the console's own reads — `GetHomeDashboard`, `GetSettings` — served
 * to a human operator with no agent run anywhere in sight. Rejecting an absent token would take the
 * whole console down to protect a surface no agent is calling. Absent token ⇒ this middleware does
 * nothing and the operator flow proceeds; a token that is PRESENT and dead is a different claim
 * entirely (a late call from a run that already ended) and gets 401.
 *
 * WHY IT COMPARES `params` + `body` AND NOT THE TOOL ARGUMENTS
 * By the time a generated tool reaches here it has already become an ordinary HTTP request, and the
 * two levels the old walk had to descend (`threadId` at the top, `data.issueId` nested) have been
 * split into `params` and `body` by the HTTP layer. `compareIdentity` reads the keys the IDENTITY
 * carries, so an identity without `issueId` compares no `issueId` — and the controller that accepts
 * an id its identity does not confine checks ownership itself, as `SteerIssueTurn` already does.
 *
 * WHY THE CODES ARE CORE'S AND NOT THE AGENT CONTEXT'S
 * `core/src/errors/codes.ts` states the rule: core never imports from a context, so it cannot raise
 * `AGENT_RUN_TOKEN_INVALID`. `UNAUTHORIZED` and `FORBIDDEN` carry the SAME statuses (401/403) the
 * predecessor did; the adapter, which is product-side, keeps raising the product's own codes.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
@singleton()
export class AgentIdentityMiddleware implements Middleware {
	constructor(private readonly identities: AgentIdentityService) {}

	async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
		const token = readAgentRunToken(request.headers)
		// NOT an agent call. The operator flow owns this request and this middleware has no opinion.
		if (!token) return {}

		const identity = this.identities.resolve(token)
		if (!identity) {
			throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED', 'missing, unknown, expired or revoked agent run token')
		}

		const mismatches = compareIdentity(identity, { ...request.params, ...request.body })
		if (mismatches.length > 0) {
			const detail = mismatches.map(m => `${m.at}=${m.supplied} (run is confined to ${m.claimed})`).join('; ')
			throw new BaseError<BaseInterfaceErrors>('FORBIDDEN', `this call targets another run's identity: ${detail}`)
		}

		// The identity the controller reads instead of re-declaring a ctx schema for what a middleware
		// injected. `ctx` never reaches the OpenAPI spec (the emitter reads only body/query/params/
		// headers), so this key is invisible to the SDK by construction.
		request.ctx = { ...request.ctx, agentIdentity: identity }
		return {}
	}
}
