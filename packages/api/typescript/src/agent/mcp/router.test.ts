import { describe, expect, it, beforeEach } from 'bun:test'
import { GlobalErrorMapper, HttpStatusCode } from '@codedm/core-typescript'
// Side-effect import: registers this context's codes in the GlobalErrorMapper. Without it the status
// assertions below read `undefined` — the union alone does not perform the registration.
import '../errors'
import { AgentName } from '../enums'
import { InMemoryAgentIdentityService } from '@codedm/core-typescript'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import type { AgentRunIdentity } from '../types/AgentRunIdentity'
import { McpRouterController } from './router'
import { wireToolName } from './wire'

/**
 * WHAT THE DOOR ITSELF STILL OWES — the credential checks that could not move to a controller.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT LEFT THIS FILE (B2 T7). The per-argument identity walk and every case that exercised it. That
 * property is measured now in `core/src/middlewares/AgentIdentityMiddleware.test.ts`, at the
 * destination controller, where `params` and `body` have already been separated by the HTTP layer and
 * the comparison reads the keys the identity actually carries instead of a hardcoded list of three
 * names. Same guarantee, one layer later, and still BEFORE any write is built.
 *
 * WHAT STAYED, AND WHY IT COULD NOT MOVE. The token resolve and the SCOPE MATCH. `tools/list` is
 * answered by the MCP SDK from the generated server with NO round trip back to any HTTP controller, so
 * a per-controller middleware structurally never sees it — this is the only point where "was this
 * credential issued for THIS surface" can be asked of EVERY JSON-RPC message. Without it an
 * `issue-handling` token both enumerates and calls the twenty-three `system` operations.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */

const OWNER_A = '00000000-0000-4000-8000-0000000000a1'
const ISSUE_A = '00000000-0000-4000-8000-0000000000a2'
const THREAD_A = '00000000-0000-4000-8000-0000000000a3'

const identityForA = (): AgentRunIdentity => ({
	ownerId: OWNER_A,
	issueId: ISSUE_A,
	threadId: THREAD_A,
	agentName: AgentName.ISSUE_WORK,
	scope: McpScope.ISSUE_HANDLING,
	expiresAt: new Date(Date.now() + 60_000),
})

/**
 * A door whose transport is OBSERVABLE — it records every dispatch instead of performing one.
 *
 * This is what turns "the refusal happens before the transport" from a claim argued in a comment into
 * an assertion. `handleRequest` is the single door every tool call must pass through to reach a
 * generated handler, an outbound HTTP call and therefore the domain; counting how many times it was
 * entered is the cheapest honest proxy for "nothing was written", and the integration suite in
 * `router.write-isolation.test.ts` measures the same property by counting rows and outbox events.
 */
class ObservableRouter extends McpRouterController {
	readonly dispatched: Request[] = []

	protected override async buildTransport(): Promise<never> {
		const transport = {
			handleRequest: async (request: Request): Promise<Response> => {
				this.dispatched.push(request)
				return Response.json({ jsonrpc: '2.0', id: 1, result: { content: [], isError: false } })
			},
		}
		return transport as never
	}
}

/** One JSON-RPC `tools/call` envelope, shaped exactly as the generated server receives it. */
const toolCall = (name: string, args: unknown): string =>
	JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })

const post = (scope: string, body: string, headers: Record<string, string>) =>
	({
		params: { scope },
		raw: new Request(`http://127.0.0.1:3030/v1/mcp/${scope}`, { method: 'POST', headers, body }),
	}) as unknown as McpRouterController['input']

describe('the door refuses BEFORE dispatching, and refuses an unusable credential at all', () => {
	let tokens: InMemoryAgentIdentityService<AgentRunIdentity>
	let router: ObservableRouter

	beforeEach(() => {
		tokens = new InMemoryAgentIdentityService<AgentRunIdentity>()
		router = new ObservableRouter(tokens)
	})

	const authorized = (token: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' })

	it('(a) NO token → AGENT_RUN_TOKEN_INVALID (401), and the transport is never reached', async () => {
		const call = toolCall(wireToolName('RecordArtifact'), { threadId: THREAD_A, data: {} })
		await expect(router.handle(post('issue-handling', call, { 'content-type': 'application/json' }))).rejects.toMatchObject({
			name: 'AGENT_RUN_TOKEN_INVALID',
		})
		// MEASURED, not read off the control flow: nothing was dispatched, so no generated handler ran,
		// so no outbound HTTP call was built, so nothing could have been written.
		expect(router.dispatched).toHaveLength(0)
	})

	it('(a) a REVOKED token → 401. This is the late tool call from a run that already died.', async () => {
		const token = tokens.issue(identityForA())
		tokens.revoke(token)
		const call = toolCall(wireToolName('RecordArtifact'), { threadId: THREAD_A, data: {} })
		await expect(router.handle(post('issue-handling', call, authorized(token)))).rejects.toMatchObject({
			name: 'AGENT_RUN_TOKEN_INVALID',
		})
	})

	it('(a) an EXPIRED token → 401, even though it was never revoked', async () => {
		const token = tokens.issue({ ...identityForA(), expiresAt: new Date(Date.now() - 1) })
		const call = toolCall(wireToolName('RecordArtifact'), { threadId: THREAD_A, data: {} })
		await expect(router.handle(post('issue-handling', call, authorized(token)))).rejects.toMatchObject({
			name: 'AGENT_RUN_TOKEN_INVALID',
		})
	})

	it('AC-6.6(d) — the CONCORDANT call IS dispatched, which is what makes the counts above mean something', async () => {
		// Without this, a router that refused everything would satisfy every assertion in this file and
		// `dispatched` would be trivially empty forever.
		const token = tokens.issue(identityForA())
		const call = toolCall(wireToolName('RecordArtifact'), { threadId: THREAD_A, data: { issueId: ISSUE_A, kind: 'LINK' } })
		const response = (await router.handle(post('issue-handling', call, authorized(token)))) as unknown as Response

		expect(response.status).toBe(HttpStatusCode.OK)
		expect(router.dispatched).toHaveLength(1)
	})

	it('an UNKNOWN scope is refused rather than resolved to the nearest one', async () => {
		const token = tokens.issue(identityForA())
		const call = toolCall(wireToolName('RecordArtifact'), { threadId: THREAD_A, data: {} })
		await expect(router.handle(post('not-a-scope', call, authorized(token)))).rejects.toMatchObject({
			name: 'AGENT_RUN_TOKEN_INVALID',
		})
	})

	it('a token minted for issue-handling CANNOT open /mcp/system — the scope is in the CLAIMS (D6-8)', async () => {
		// THE ESCALATION THIS CLOSES, stated as the attacker would run it. `IssueWorkAgent` is driven by
		// the text of an inbound WhatsApp message written by a stranger; its token is handed to the child
		// CLI on argv, where a shell-capable model can read it. Before the scope claim existed, replaying
		// those same bytes against `/mcp/system` authenticated `CreateOwner`, `DisableOwner`,
		// `AddWorkspace` and `RemoveWorkspace` — none of which carry a confinement axis, so the
		// destination-side comparison finds nothing to reject. `--allowedTools` is the client-side half
		// of the rule, and the client is the attacker's.
		const token = tokens.issue(identityForA())
		const call = toolCall(wireToolName('RemoveWorkspace'), { workspaceId: '019e4d24-6524-7041-9e1c-8108180cddae' })

		await expect(router.handle(post('system', call, authorized(token)))).rejects.toMatchObject({
			name: 'AGENT_RUN_SCOPE_MISMATCH',
		})
		expect(router.dispatched).toHaveLength(0)
		expect(GlobalErrorMapper.AGENT_RUN_SCOPE_MISMATCH).toBe(HttpStatusCode.FORBIDDEN)
	})

	it('the SAME token is accepted against the scope it WAS minted for — the check is not "refuse everything"', async () => {
		const token = tokens.issue(identityForA())
		const call = toolCall(wireToolName('RecordArtifact'), { threadId: THREAD_A, data: { kind: 'LINK' } })
		await router.handle(post('issue-handling', call, authorized(token)))
		expect(router.dispatched).toHaveLength(1)
	})

	it('a SYSTEM-scoped token is likewise confined — the rule is symmetric, not a special case for one scope', async () => {
		const token = tokens.issue({ ...identityForA(), scope: McpScope.system })
		const call = toolCall(wireToolName('RecordArtifact'), { threadId: THREAD_A, data: { kind: 'LINK' } })
		await expect(router.handle(post('issue-handling', call, authorized(token)))).rejects.toMatchObject({
			name: 'AGENT_RUN_SCOPE_MISMATCH',
		})
		expect(router.dispatched).toHaveLength(0)
	})
})

describe('the door grants no ambient authority', () => {
	it('it carries NO middleware — nothing stamps operator authority onto a tool call', () => {
		// `OperatorMiddleware` on this route would grant every inbound JSON-RPC message the daemon's own
		// authority before the token was even read: the confused-deputy shape the whole file prevents.
		expect(new McpRouterController(new InMemoryAgentIdentityService<AgentRunIdentity>()).middlewares).toEqual([])
	})
})
