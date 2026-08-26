import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread } from '@test/support'
import { ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { RecordArtifact } from '@artifact/usecases/RecordArtifact'
import { AgentName } from '../enums'
import { InMemoryAgentIdentityService } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import type { AgentRunIdentity } from '../types/AgentRunIdentity'
import { McpDoorController } from './door'
import { wireToolName } from './wire'

/**
 * "AND NOTHING WAS WRITTEN", MEASURED BY COUNTING, not by the absence of an exception.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY A SECOND SUITE. `door.test.ts` proves the door does not DISPATCH a refused call. That is
 * necessary and it is not what the AC asks for: it asks for row counts and outbox counts taken before
 * and after. A dispatch counter is a proxy; this file removes the proxy.
 *
 * WHICH REFUSAL IS COUNTED, AFTER B2 T7. The per-argument identity walk left this file's subject: it
 * runs at the destination controller now (`AgentIdentityMiddleware`), which never issues the outbound
 * write either. What the door still refuses on its own is an unusable credential and a credential
 * aimed at the WRONG SURFACE — so those are what is counted here, against the same control that
 * writes. The asymmetry between the control and the refusals IS the measurement, and it is unchanged.
 *
 * HOW IT IS HONEST. The transport substituted below is not a no-op stand-in whose silence proves
 * nothing — it EXECUTES THE REAL `RecordArtifact` USE CASE, against the real (in-process) database, on
 * the arguments the tool call carried. So the control case genuinely moves all three counters, and the
 * rejected cases genuinely leave them still. The asymmetry between the two IS the measurement; without
 * a transport that writes, "no rows appeared" would be true of a door that had simply been handed
 * nothing to do.
 *
 * WHY NOT THE GENERATED SERVER HERE. It would make a real outbound HTTP call to a daemon that is not
 * listening in a unit test, so the write would fail for the wrong reason and the counters would be
 * still no matter what the door did — the classic vacuously-green gate. The generated server is
 * driven for real in `generated-server.test.ts` (in-memory MCP client) and end-to-end in the
 * Playwright e2e (real daemon, real HTTP, real declaration).
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */

const ISSUE_A = '00000000-0000-4000-8000-0000000000a2'

/** The three counters the AC names. `artifacts` is the row; `events` + `outbox` are the fact. */
const COUNTED = ['artifacts', 'events', 'outbox'] as const

/**
 * A door whose transport PERFORMS the write a dispatched tool call would have performed.
 *
 * This is the shortest path that is still real: the generated handler's whole job is to turn the tool
 * arguments into `POST /threads/:threadId/artifacts`, which the controller turns into exactly this
 * use-case call. Standing in for the HTTP hop keeps the test hermetic while leaving the thing being
 * measured — whether the door let anything through — completely untouched.
 */
class WritingDoor extends McpDoorController {
	constructor(
		tokens: InMemoryAgentIdentityService<AgentRunIdentity>,
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
					ownerId: MOCK_CLOUD_OWNER_ID,
					threadId: args.threadId ?? '',
					kind: ArtifactKind.LINK,
					name: 'dispatched',
					ref: 'https://codm.local/dispatched',
					meta: '{}',
					...(typeof args.data?.issueId === 'string' && { issueId: args.data.issueId }),
				})
				return Response.json({ jsonrpc: '2.0', id: 1, result: { content: [], isError: false } })
			},
		}
		return transport as never
	}
}

describe('a refused tool call writes NOTHING, counted', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let tokens: InMemoryAgentIdentityService<AgentRunIdentity>
	let door: WritingDoor
	let threadId: string

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		threadId = thread.id.value
		tokens = new InMemoryAgentIdentityService<AgentRunIdentity>()
		door = new WritingDoor(tokens, testBed.resolve(RecordArtifact))
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const identity = (): AgentRunIdentity => ({
		ownerId: MOCK_CLOUD_OWNER_ID,
		issueId: ISSUE_A,
		threadId,
		agentName: AgentName.ISSUE_WORK,
		scope: McpScope.ISSUE_HANDLING,
		expiresAt: new Date(Date.now() + 60_000),
	})

	const call = (args: unknown): string =>
		JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: wireToolName('RecordArtifact'), arguments: args } })

	const post = (scope: string, body: string, headers: Record<string, string>) =>
		({
			params: { scope },
			raw: new Request(`http://127.0.0.1:3030/mcp/${scope}`, { method: 'POST', headers, body }),
		}) as unknown as McpDoorController['input']

	const authorized = (token: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' })
	const anonymous = () => ({ 'content-type': 'application/json' })

	it('THE CONTROL — a concordant call DOES move all three counters', async () => {
		// Runs first and asserts the opposite of everything below. Without it, every "unchanged" result
		// in this file would also be produced by a transport that silently did nothing.
		const token = tokens.issue(identity())
		const before = await testBed.probe().snapshot(COUNTED)

		await door.handle(post('issue-handling', call({ threadId, data: { kind: ArtifactKind.LINK } }), authorized(token)))

		const after = await testBed.probe().snapshot(COUNTED)
		expect(after.artifacts).toBe(before.artifacts + 1)
		expect(after.events).toBe(before.events + 1)
		expect(after.outbox).toBe(before.outbox + 1)
	})

	it('(a) an ABSENT token → 401, and nothing moves', async () => {
		const before = await testBed.probe().snapshot(COUNTED)
		await expect(door.handle(post('issue-handling', call({ threadId, data: {} }), anonymous()))).rejects.toMatchObject({
			name: 'AGENT_RUN_TOKEN_INVALID',
		})
		expect(await testBed.probe().snapshot(COUNTED)).toEqual(before)
	})

	it('(a) a REVOKED token → 401, and nothing moves — the late call from a run that already died', async () => {
		const token = tokens.issue(identity())
		tokens.revoke(token)
		const before = await testBed.probe().snapshot(COUNTED)
		await expect(door.handle(post('issue-handling', call({ threadId, data: {} }), authorized(token)))).rejects.toMatchObject({
			name: 'AGENT_RUN_TOKEN_INVALID',
		})
		expect(await testBed.probe().snapshot(COUNTED)).toEqual(before)
	})

	it('(D6-8) a token issued for another SCOPE → nothing moves', async () => {
		const token = tokens.issue({ ...identity(), scope: McpScope.system })
		const before = await testBed.probe().snapshot(COUNTED)
		await expect(
			door.handle(post('issue-handling', call({ threadId, data: { kind: ArtifactKind.LINK } }), authorized(token))),
		).rejects.toMatchObject({ name: 'AGENT_RUN_SCOPE_MISMATCH' })
		expect(await testBed.probe().snapshot(COUNTED)).toEqual(before)
	})
})
