import { describe, expect, it, beforeEach } from 'bun:test'
import { BaseError, GlobalErrorMapper, HttpStatusCode } from '@codedm/core-typescript'
// Side-effect import: registers this context's codes in the GlobalErrorMapper. Without it the status
// assertions below read `undefined` — the union alone does not perform the registration.
import '../errors'
import { AgentName } from '../enums'
import type { RunTokenClaims } from '../services/RunTokenService'
import { InMemoryRunTokenService } from './RunTokenService'
import { findIdentityMismatches, assertIdentityMatchesClaims } from './identity'
import { McpRouterController } from './router'
import { wireToolName } from './wire'

/**
 * AC-6.6 — THE MANDATORY MITIGATION. Without this suite green the phase does not close.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IT IS DEFENDING. Fase 1 froze the tool schemas with NO identity field, which made "declare
 * against the wrong issue" INEXPRESSIBLE. Generated tools inherit their controller's parameters, so
 * the guarantee degraded from IMPOSSIBLE to VALIDATED — a conscious regression whose price is exactly
 * this file. The attack it models is not hypothetical: an inbound WhatsApp message is attacker-authored
 * text that reaches a model holding six write tools, and "act on a different issue" is the first thing
 * an injected instruction would try.
 *
 * WHY THREE VECTORS AND NOT ONE. Measured on the generated server, driven by a real MCP `Client`: a
 * `tools/call` for `RecordArtifact` accepts `threadId` as a PATH parameter AND carries an `issueId`
 * inside `data` (the use case's `issueId` is `z.uuid().optional()` and the controller composes its body
 * with `.omit({ ownerId, threadId })`). A router that compared only the path parameter would pass a
 * cross-issue test while the BODY still targeted issue B.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */

const OWNER_A = '00000000-0000-4000-8000-0000000000a1'
const OWNER_B = '00000000-0000-4000-8000-0000000000b1'
const ISSUE_A = '00000000-0000-4000-8000-0000000000a2'
const ISSUE_B = '00000000-0000-4000-8000-0000000000b2'
const THREAD_A = '00000000-0000-4000-8000-0000000000a3'
const THREAD_B = '00000000-0000-4000-8000-0000000000b3'

const claimsForA = (): RunTokenClaims => ({
	ownerId: OWNER_A,
	issueId: ISSUE_A,
	threadId: THREAD_A,
	agentName: AgentName.ISSUE_WORK,
	scope: 'issue-handling',
	expiresAt: new Date(Date.now() + 60_000),
})

/**
 * A router whose transport is OBSERVABLE — it records every dispatch instead of performing one.
 *
 * This is what turns "the reject happens before the transport" from a claim argued in a comment into
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

describe('AC-6.6(b) — the cross-issue attempt is rejected on ALL THREE axes', () => {
	const claims = claimsForA()

	it('PATH PARAM — a threadId that disagrees with the claims', () => {
		// The literal shape the probe observed the generated tool emit:
		// POST /v1/threads/ATTACKER-CHOSEN-THREAD-ID/artifacts
		const mismatches = findIdentityMismatches({ threadId: THREAD_B, data: { kind: 'LINK', name: 'x', ref: 'y', meta: '{}' } }, claims)
		expect(mismatches).toHaveLength(1)
		expect(mismatches[0]).toMatchObject({ at: 'threadId', key: 'threadId', supplied: THREAD_B, claimed: THREAD_A })
	})

	it('REQUEST BODY — the correct threadId, but an issueId inside `data` pointing at issue B', () => {
		// THE VECTOR A PATH-ONLY CHECK MISSES. `RecordArtifactInputSchema` carries
		// `issueId: z.uuid().optional()` and the controller omits only `ownerId`/`threadId`, so the model
		// chooses this value and it rides in the payload.
		const mismatches = findIdentityMismatches({ threadId: THREAD_A, data: { issueId: ISSUE_B, kind: 'LINK' } }, claims)
		expect(mismatches).toHaveLength(1)
		expect(mismatches[0]).toMatchObject({ at: 'data.issueId', key: 'issueId', supplied: ISSUE_B, claimed: ISSUE_A })
	})

	it('QUERY / any other position — the walk is positional-agnostic, at any depth', () => {
		const mismatches = findIdentityMismatches({ params: { query: { ownerId: OWNER_B } }, nested: [{ issueId: ISSUE_B }] }, claims)
		expect(mismatches.map(m => m.at).sort()).toEqual(['nested[0].issueId', 'params.query.ownerId'])
	})

	it('reports EVERY axis at once, not just the first — a two-axis attempt is logged as a two-axis attempt', () => {
		const mismatches = findIdentityMismatches({ threadId: THREAD_B, data: { issueId: ISSUE_B } }, claims)
		expect(mismatches).toHaveLength(2)
	})

	it('AC-6.6(d) — the HAPPY path with concordant identity is NOT rejected', () => {
		// Without this clause a router that rejects everything would satisfy the whole AC.
		expect(findIdentityMismatches({ threadId: THREAD_A, data: { issueId: ISSUE_A, kind: 'LINK' } }, claims)).toEqual([])
		expect(() => assertIdentityMatchesClaims({ threadId: THREAD_A, data: { issueId: ISSUE_A } }, claims)).not.toThrow()
	})

	it('the rejection is AGENT_RUN_SCOPE_MISMATCH → 403, never the 401 of an invalid token', () => {
		// A valid token pointed at the wrong target is NOT an authentication problem: answering 401 would
		// tell the caller to authenticate again when authenticating changes nothing, and would leave the
		// log unable to tell an expired run from an attempted cross-issue write.
		try {
			assertIdentityMatchesClaims({ threadId: THREAD_B }, claims)
			throw new Error('expected a rejection')
		} catch (error) {
			expect(error).toBeInstanceOf(BaseError)
			expect((error as BaseError<string>).name).toBe('AGENT_RUN_SCOPE_MISMATCH')
		}
		expect(GlobalErrorMapper.AGENT_RUN_SCOPE_MISMATCH).toBe(HttpStatusCode.FORBIDDEN)
		expect(GlobalErrorMapper.AGENT_RUN_TOKEN_INVALID).toBe(HttpStatusCode.UNAUTHORIZED)
	})
})

describe('AC-6.6 — the router refuses BEFORE dispatching, and refuses an invalid token at all', () => {
	let tokens: InMemoryRunTokenService
	let router: ObservableRouter

	beforeEach(() => {
		tokens = new InMemoryRunTokenService()
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
		const token = tokens.mint(claimsForA())
		tokens.revoke(token)
		const call = toolCall(wireToolName('RecordArtifact'), { threadId: THREAD_A, data: {} })
		await expect(router.handle(post('issue-handling', call, authorized(token)))).rejects.toMatchObject({
			name: 'AGENT_RUN_TOKEN_INVALID',
		})
	})

	it('(a) an EXPIRED token → 401, even though it was never revoked', async () => {
		const token = tokens.mint({ ...claimsForA(), expiresAt: new Date(Date.now() - 1) })
		const call = toolCall(wireToolName('RecordArtifact'), { threadId: THREAD_A, data: {} })
		await expect(router.handle(post('issue-handling', call, authorized(token)))).rejects.toMatchObject({
			name: 'AGENT_RUN_TOKEN_INVALID',
		})
	})

	it('a VALID token aimed at another issue answers 403 and NEVER reaches the transport', async () => {
		const token = tokens.mint(claimsForA())
		// The body vector — correct thread, wrong issue. If the router dispatched this, the generated
		// handler would issue `POST /v1/threads/<A>/artifacts` carrying issue B, and the MCP SDK would
		// only notice afterwards while validating the OUTPUT schema — with the write already sent.
		const call = toolCall(wireToolName('RecordArtifact'), { threadId: THREAD_A, data: { issueId: ISSUE_B, kind: 'LINK' } })

		const response = (await router.handle(post('issue-handling', call, authorized(token)))) as unknown as Response
		const payload = (await response.json()) as { error?: { message?: string } }

		// BOTH layers carry the refusal: 403 on the wire (what AC-6.6(b) contracts, and what an access
		// log or a proxy reads) and a JSON-RPC error the MCP client can actually render.
		expect(response.status).toBe(HttpStatusCode.FORBIDDEN)
		expect(payload.error?.message).toContain('AGENT_RUN_SCOPE_MISMATCH')
		expect(payload.error?.message).toContain(ISSUE_B)
		expect(router.dispatched).toHaveLength(0)
	})

	it('AC-6.6(d) — the CONCORDANT call IS dispatched, which is what makes the counts above mean something', async () => {
		// Without this, a router that refused everything would satisfy every assertion in this file and
		// `dispatched` would be trivially empty forever.
		const token = tokens.mint(claimsForA())
		const call = toolCall(wireToolName('RecordArtifact'), { threadId: THREAD_A, data: { issueId: ISSUE_A, kind: 'LINK' } })
		const response = (await router.handle(post('issue-handling', call, authorized(token)))) as unknown as Response

		expect(response.status).toBe(HttpStatusCode.OK)
		expect(router.dispatched).toHaveLength(1)
	})

	it('an UNKNOWN scope is refused rather than resolved to the nearest one', async () => {
		const token = tokens.mint(claimsForA())
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
		// `AddWorkspace` and `RemoveWorkspace` — none of which carry an identity key, so the walk found
		// nothing to compare and waved them through. `--allowedTools` is the client-side half of the
		// rule, and the client is the attacker's.
		const token = tokens.mint(claimsForA())
		const call = toolCall(wireToolName('RemoveWorkspace'), { workspaceId: '019e4d24-6524-7041-9e1c-8108180cddae' })

		await expect(router.handle(post('system', call, authorized(token)))).rejects.toMatchObject({
			name: 'AGENT_RUN_SCOPE_MISMATCH',
		})
		expect(router.dispatched).toHaveLength(0)
		expect(GlobalErrorMapper.AGENT_RUN_SCOPE_MISMATCH).toBe(HttpStatusCode.FORBIDDEN)
	})

	it('the SAME token is accepted against the scope it WAS minted for — the check is not "refuse everything"', async () => {
		const token = tokens.mint(claimsForA())
		const call = toolCall(wireToolName('RecordArtifact'), { threadId: THREAD_A, data: { kind: 'LINK' } })
		await router.handle(post('issue-handling', call, authorized(token)))
		expect(router.dispatched).toHaveLength(1)
	})

	it('a SYSTEM-scoped token is likewise confined — the rule is symmetric, not a special case for one scope', async () => {
		const token = tokens.mint({ ...claimsForA(), scope: 'system' })
		const call = toolCall(wireToolName('RecordArtifact'), { threadId: THREAD_A, data: { kind: 'LINK' } })
		await expect(router.handle(post('issue-handling', call, authorized(token)))).rejects.toMatchObject({
			name: 'AGENT_RUN_SCOPE_MISMATCH',
		})
		expect(router.dispatched).toHaveLength(0)
	})

	it('a BATCH is checked member by member — one bad member taints the batch', async () => {
		const token = tokens.mint(claimsForA())
		const batch = JSON.stringify([
			{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'RecordArtifact', arguments: { threadId: THREAD_A } } },
			{ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'RecordArtifact', arguments: { threadId: THREAD_B } } },
		])
		const response = (await router.handle(post('issue-handling', batch, authorized(token)))) as unknown as Response
		const payload = (await response.json()) as { error?: { message?: string } }
		expect(response.status).toBe(HttpStatusCode.FORBIDDEN)
		expect(payload.error?.message).toContain('AGENT_RUN_SCOPE_MISMATCH')
		// The GOOD member is not dispatched either: a batch is one message, and half-executing it would
		// let an attacker smuggle a legitimate call through alongside a rejected one.
		expect(router.dispatched).toHaveLength(0)
	})
})

describe('AC-6.6(c) — the operator ctx comes from the CLAIMS, not from an ambient session', () => {
	it("a token of O1 cannot name O2's resources, even though the daemon has exactly one operator", () => {
		// The daemon runs a single operator, so `ctx.ownerId` is a constant downstream. That makes the
		// ownerId axis MORE important here, not less: it is the only place the run's own owner is
		// compared to what the model asked for, and a walk that skipped it would let an injected
		// instruction name someone else's owner id and rely on the middleware to stamp authority anyway.
		const mismatches = findIdentityMismatches({ ownerId: OWNER_B, data: { ownerId: OWNER_B } }, claimsForA())
		expect(mismatches.map(m => m.at)).toEqual(['ownerId', 'data.ownerId'])
	})

	it('the router carries NO middleware — nothing stamps operator authority onto a tool call', () => {
		// `OperatorMiddleware` on this route would grant every inbound JSON-RPC message the daemon's own
		// authority before the token was even read: the confused-deputy shape the whole file prevents.
		expect(new McpRouterController(new InMemoryRunTokenService()).middlewares).toEqual([])
	})
})
