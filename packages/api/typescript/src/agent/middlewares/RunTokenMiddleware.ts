import { singleton } from 'tsyringe-neo'
import { BaseError, type HttpControllerRequest, type HttpMiddlewareResponse, type Middleware } from '@codedm/core-typescript'
import { MCP_RUN_TOKEN_HEADER } from '@codedm/client-typescript/typescript/mcp/context'
import { AgentIdentityService } from '@codedm/core-typescript'
import type { AgentRunIdentity } from '../types/AgentRunIdentity'
import type { AgentInterfaceErrors } from '../errors'

/**
 * Stamps the RUN's own identity onto `ctx` from its run token — the injection half of §7.2.
 *
 * ### Why identity is INJECTED here rather than accepted as an argument
 * `issue/create` needs the transcript entry that asked for the issue, because that entry is what the
 * finished answer quotes (§7.6). If the field were part of the tool's body schema the MODEL would
 * supply it, and a model reading a group chat written by third parties could attribute its issue to
 * any message in the conversation — the reply would then arrive quoting a message nobody wrote it
 * about. Keeping the field OUT of the schema makes that unforgeable by construction rather than by
 * validation: there is no argument to check, because there is no argument.
 *
 * ### Why a middleware and not the MCP router
 * §7.2 says "o router injeta das claims", and the router is indeed where the token is first verified —
 * but it dispatches JSON-RPC to the generated MCP server, whose tool handlers then call BACK over HTTP
 * into these controllers (that round trip is what `mcp/context` exists for). Arguments rewritten in
 * the router would have to survive a schema the generated tool derives from this controller's own
 * input — i.e. the field would have to be in the schema after all, which is the thing we are avoiding.
 * The token rides the callback in `MCP_RUN_TOKEN_HEADER`, so the honest injection point is here, on
 * the receiving side, one layer before the controller reads `ctx`.
 *
 * Pairs with `OperatorMiddleware` rather than replacing it: that one stamps WHO the daemon is, this
 * one stamps WHICH RUN is speaking. Both are needed on a tool-facing route, and the order does not
 * matter because they write disjoint keys.
 */
@singleton()
export class RunTokenMiddleware implements Middleware {
	constructor(private readonly identities: AgentIdentityService<AgentRunIdentity>) {}

	async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
		const token = request.headers?.[MCP_RUN_TOKEN_HEADER] ?? request.headers?.[MCP_RUN_TOKEN_HEADER.toLowerCase()]
		const identity = typeof token === 'string' ? this.identities.resolve(token) : null
		// FAIL CLOSED. A route that carries this middleware is reachable ONLY from inside a run, so a
		// missing or dead token is not an anonymous caller to be served with the daemon's own authority
		// — it is a late tool call from a run that already ended, or a request that never was one. The
		// alternative (fall through with no `entryId`) would let `issue/create` mint an issue with no
		// provenance, and the eventual answer would quote nothing.
		if (!identity) {
			throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_TOKEN_INVALID', 'this operation is only reachable from inside an agent run')
		}

		request.ctx = { ...request.ctx, runClaims: identity }
		return {}
	}
}
