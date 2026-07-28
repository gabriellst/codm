import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread } from '@test/support'
import { ArtifactKind } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { RecordArtifact } from '@artifact/usecases/RecordArtifact'
import { AgentName } from '../enums'
import type { RunTokenClaims } from '../services/RunTokenService'
import { InMemoryRunTokenService } from './RunTokenService'
import { McpRouterController } from './router'
import { wireToolName } from './wire'

/**
 * AC-6.6 — "AND NOTHING WAS WRITTEN", MEASURED BY COUNTING, not by the absence of an exception.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY A SECOND SUITE. `router.test.ts` proves the router does not DISPATCH a rejected call. That is
 * necessary and it is not what the AC asks for: it asks for row counts and outbox counts taken before
 * and after. A dispatch counter is a proxy; this file removes the proxy.
 *
 * HOW IT IS HONEST. The transport substituted below is not a no-op stand-in whose silence proves
 * nothing — it EXECUTES THE REAL `RecordArtifact` USE CASE, against the real (in-process) database, on
 * the arguments the tool call carried. So the control case genuinely moves all three counters, and the
 * rejected cases genuinely leave them still. The asymmetry between the two IS the measurement; without
 * a transport that writes, "no rows appeared" would be true of a router that had simply been handed
 * nothing to do.
 *
 * WHY NOT THE GENERATED SERVER HERE. It would make a real outbound HTTP call to a daemon that is not
 * listening in a unit test, so the write would fail for the wrong reason and the counters would be
 * still no matter what the router did — the classic vacuously-green gate. The generated server is
 * driven for real in `generated-server.test.ts` (in-memory MCP client) and end-to-end in the
 * Playwright e2e (real daemon, real HTTP, real declaration).
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */

const ISSUE_A = '00000000-0000-4000-8000-0000000000a2'
const ISSUE_B = '00000000-0000-4000-8000-0000000000b2'
const THREAD_B = '00000000-0000-4000-8000-0000000000b3'

/** The three counters the AC names. `artifacts` is the row; `events` + `outbox` are the fact. */
const COUNTED = ['artifacts', 'events', 'outbox'] as const

/**
 * A router whose transport PERFORMS the write a dispatched tool call would have performed.
 *
 * This is the shortest path that is still real: the generated handler's whole job is to turn the tool
 * arguments into `POST /v1/threads/:threadId/artifacts`, which the controller turns into exactly this
 * use-case call. Standing in for the HTTP hop keeps the test hermetic while leaving the thing being
 * measured — whether the router let anything through — completely untouched.
 */
class WritingRouter extends McpRouterController {
	constructor(
		tokens: InMemoryRunTokenService,
		private readonly recordArtifact: RecordArtifact,
	) {
		super(tokens)
	}

	protected override async buildTransport(): Promise<never> {
		const transport = {
			handleRequest: async (request: Request): Promise<Response> => {
				const message = (await request.json()) as { params?: { arguments?: { threadId?: string; data?: Record<string, unknown> } } }
				const args = message.params?.arguments ?? {}
				await this.recordArtifact.execute({
					ownerId: OPERATOR_ID,
					threadId: args.threadId ?? '',
					kind: ArtifactKind.LINK,
					name: 'dispatched',
					ref: 'https://codedm.local/dispatched',
					meta: '{}',
					...(typeof args.data?.issueId === 'string' && { issueId: args.data.issueId }),
				})
				return Response.json({ jsonrpc: '2.0', id: 1, result: { content: [], isError: false } })
			},
		}
		return transport as never
	}
}

describe('AC-6.6 — a refused tool call writes NOTHING, counted', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let tokens: InMemoryRunTokenService
	let router: WritingRouter
	let threadId: string

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		threadId = thread.id.value
		tokens = new InMemoryRunTokenService()
		router = new WritingRouter(tokens, testBed.resolve(RecordArtifact))
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const claims = (): RunTokenClaims => ({
		ownerId: OPERATOR_ID,
		issueId: ISSUE_A,
		threadId,
		agentName: AgentName.ISSUE_WORK,
		scope: 'issue-handling',
		expiresAt: new Date(Date.now() + 60_000),
	})

	const call = (args: unknown): string =>
		JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: wireToolName('RecordArtifact'), arguments: args } })

	const post = (scope: string, body: string, headers: Record<string, string>) =>
		({
			params: { scope },
			raw: new Request(`http://127.0.0.1:3030/v1/mcp/${scope}`, { method: 'POST', headers, body }),
		}) as unknown as McpRouterController['input']

	const authorized = (token: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' })
	const anonymous = () => ({ 'content-type': 'application/json' })

	it('THE CONTROL — a concordant call DOES move all three counters', async () => {
		// Runs first and asserts the opposite of everything below. Without it, every "unchanged" result
		// in this file would also be produced by a transport that silently did nothing.
		const token = tokens.mint(claims())
		const before = await testBed.probe().snapshot(COUNTED)

		await router.handle(post('issue-handling', call({ threadId, data: { kind: ArtifactKind.LINK } }), authorized(token)))

		const after = await testBed.probe().snapshot(COUNTED)
		expect(after.artifacts).toBe(before.artifacts + 1)
		expect(after.events).toBe(before.events + 1)
		expect(after.outbox).toBe(before.outbox + 1)
	})

	it('(a) an ABSENT token → 401, and nothing moves', async () => {
		const before = await testBed.probe().snapshot(COUNTED)
		await expect(router.handle(post('issue-handling', call({ threadId, data: {} }), anonymous()))).rejects.toMatchObject({
			name: 'AGENT_RUN_TOKEN_INVALID',
		})
		expect(await testBed.probe().snapshot(COUNTED)).toEqual(before)
	})

	it('(a) a REVOKED token → 401, and nothing moves — the late call from a run that already died', async () => {
		const token = tokens.mint(claims())
		tokens.revoke(token)
		const before = await testBed.probe().snapshot(COUNTED)
		await expect(router.handle(post('issue-handling', call({ threadId, data: {} }), authorized(token)))).rejects.toMatchObject({
			name: 'AGENT_RUN_TOKEN_INVALID',
		})
		expect(await testBed.probe().snapshot(COUNTED)).toEqual(before)
	})

	it('(b) CROSS-ISSUE via the PATH param → nothing moves', async () => {
		const token = tokens.mint(claims())
		const before = await testBed.probe().snapshot(COUNTED)
		const response = (await router.handle(
			post('issue-handling', call({ threadId: THREAD_B, data: { kind: ArtifactKind.LINK } }), authorized(token)),
		)) as Response
		expect(response.status).toBe(403)
		expect(await testBed.probe().snapshot(COUNTED)).toEqual(before)
	})

	it('(b) CROSS-ISSUE via the BODY — right thread, wrong issue → nothing moves', async () => {
		// THE VECTOR A PATH-ONLY CHECK MISSES, and the reason this file counts rather than reads: the
		// transport above WOULD have written this artifact against issue B, with a perfectly valid token
		// and a perfectly correct thread.
		const token = tokens.mint(claims())
		const before = await testBed.probe().snapshot(COUNTED)
		const response = (await router.handle(
			post('issue-handling', call({ threadId, data: { issueId: ISSUE_B, kind: ArtifactKind.LINK } }), authorized(token)),
		)) as Response
		expect(response.status).toBe(403)
		expect(await testBed.probe().snapshot(COUNTED)).toEqual(before)
	})

	it('(D6-8) a token minted for another SCOPE → nothing moves', async () => {
		const token = tokens.mint({ ...claims(), scope: 'system' })
		const before = await testBed.probe().snapshot(COUNTED)
		await expect(
			router.handle(post('issue-handling', call({ threadId, data: { kind: ArtifactKind.LINK } }), authorized(token))),
		).rejects.toMatchObject({ name: 'AGENT_RUN_SCOPE_MISMATCH' })
		expect(await testBed.probe().snapshot(COUNTED)).toEqual(before)
	})
})
