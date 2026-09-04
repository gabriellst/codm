import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { DomainEventRepository, InMemoryAgentIdentityService } from '@codm/core-typescript'
import { McpApprovalPolicy, McpScope, McpTransport, StopKind } from '@codm/contracts-typescript/wire/enums'
import { StopPolicyConfigRepository, DEFAULT_STOP_POLICY } from '@thread/repositories/StopPolicyConfigRepository'
import { AgentName } from '../enums'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import type { AgentRunIdentity } from '../types/AgentRunIdentity'
import { McpServer } from '../entities/McpServer'
import { McpServerRepository } from '../repositories/McpServerRepository'
import { McpToolApprovalRepository } from '../repositories/McpToolApprovalRepository'
import { McpUpstreamRegistry, MockMcpUpstreamRegistry, type UpstreamTool } from '../services/McpUpstreamRegistry'
import { RequestMcpToolApproval } from '../usecases/RequestMcpToolApproval'
import { McpDoorController } from './door'
import { upstreamToolName } from './upstream'

/**
 * T10, SECOND HALF — the owner's GLOBAL pre-approval (`StopPolicy.approvalNeeded`), proven end to end
 * through the REAL door, the REAL generated transport, and a REAL (in-process SQLite) database. Where
 * `approvalPolicy.test.ts` proves the resolver function in isolation, this file proves the wire that
 * carries its answer: a server registered `ASK`, flipped by the owner's settings toggle rather than by
 * anything server- or tool-scoped, exactly like `claude --dangerously-skip-permissions` does not touch
 * any one tool's config.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY "A STOP WAS RAISED" IS MEASURED VIA THE DOMAIN EVENT, NOT THE `stops` TABLE. `RequestMcpToolApproval`
 * → `DeclareStop` persists an `AgentRunStopRaisedEvent` to the outbox in the SAME transaction as the
 * `McpToolApproval` row (see `RequestMcpToolApproval`'s docblock) — the row that actually lands in
 * `issue_stops` is written by a HANDLER reacting to that event through the outbox dispatcher, which this
 * harness never runs. `DeclareStop.test.ts` measures the identical fact the identical way
 * (`eventRepo.findByType(AgentRunStopRaisedEvent)`), so this file stays consistent with the existing
 * idiom rather than inventing a second one.
 *
 * WHY THE SECOND HALF DOES NOT MERELY CHECK "a stop appeared" — it also re-asserts `calls.length === 1`,
 * unchanged from the FIRST half's assertion, which is the one number a defect could leave alone while
 * still producing a stop for the wrong reason (e.g. a bug that raises a stop AND still calls upstream).
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */

const OWNER_ID = testId('door-preapproved', 'owner')
const ISSUE_ID = testId('door-preapproved', 'issue')
const THREAD_ID = testId('door-preapproved', 'thread')

const SERVER_KEY = 'docs'
const TOOL: UpstreamTool = {
	serverKey: SERVER_KEY,
	name: 'search',
	inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
	approvalPolicy: McpApprovalPolicy.ASK,
}

describe('T10 — the owner can pre-approve everything, like the dangerous mode of claude', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let tokens: InMemoryAgentIdentityService<AgentRunIdentity>
	let upstream: MockMcpUpstreamRegistry
	let door: McpDoorController

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER_ID })
	})

	beforeEach(async () => {
		await testBed.reset()

		const mcpServers = testBed.resolve(McpServerRepository)
		await mcpServers.save(
			McpServer.create({
				ownerId: OWNER_ID,
				key: SERVER_KEY,
				transport: McpTransport.STDIO,
				command: 'npx',
				approvalPolicy: McpApprovalPolicy.ASK,
			}),
		)

		upstream = testBed.resolve(McpUpstreamRegistry) as MockMcpUpstreamRegistry
		upstream.tools = [TOOL]

		tokens = new InMemoryAgentIdentityService<AgentRunIdentity>()
		door = new McpDoorController(
			tokens,
			upstream,
			mcpServers,
			testBed.resolve(StopPolicyConfigRepository),
			testBed.resolve(McpToolApprovalRepository),
			testBed.resolve(RequestMcpToolApproval),
		)
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	const identity = (): AgentRunIdentity => ({
		ownerId: OWNER_ID,
		issueId: ISSUE_ID,
		threadId: THREAD_ID,
		agentName: AgentName.ISSUE_WORK,
		scope: McpScope.ISSUE_HANDLING,
		expiresAt: new Date(Date.now() + 60_000),
	})

	const toolCall = (): string =>
		JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: upstreamToolName(TOOL), arguments: { query: 'how do I deploy' } },
		})

	const post = (body: string, headers: Record<string, string>) =>
		({
			params: { scope: 'issue-handling' },
			raw: new Request('http://127.0.0.1:3030/mcp/issue-handling', { method: 'POST', headers, body }),
		}) as unknown as McpDoorController['input']

	// Carries `accept` — this suite runs the REAL `WebStandardStreamableHTTPServerTransport`, which
	// rejects a request that does not accept both `application/json` and `text/event-stream` with a 406
	// before any JSON-RPC method is read (see `door.test.ts`'s T6 suite for the same requirement).
	const authorized = (token: string) => ({
		authorization: `Bearer ${token}`,
		'content-type': 'application/json',
		accept: 'application/json, text/event-stream',
	})

	const raisedStops = async () => {
		const eventRepo = testBed.resolve(DomainEventRepository)
		return eventRepo.findByType(AgentRunStopRaisedEvent)
	}

	it(
		'approvalNeeded OFF: a server registered ASK executes anyway, and NO stop is raised. ' +
			'approvalNeeded back ON: the SAME situation now gates — calls stay at 1, and a stop now exists',
		async () => {
			const stopPolicies = testBed.resolve(StopPolicyConfigRepository)

			// ── Phase 1 — the owner's global pre-approval is OFF-for-asking, i.e. dangerous mode ON ──
			await stopPolicies.upsert(OWNER_ID, { ...DEFAULT_STOP_POLICY, approvalNeeded: false })

			const token = tokens.issue(identity())
			const firstResponse = (await door.handle(post(toolCall(), authorized(token)))) as unknown as Response
			const firstBody = (await firstResponse.json()) as { result: { isError?: boolean } }

			expect(firstBody.result.isError).not.toBe(true)
			expect(upstream.calls).toHaveLength(1)
			expect(await raisedStops()).toHaveLength(0)

			// ── Phase 2 — the owner turns approvalNeeded back ON. Nothing about the server or the tool
			// changed — only the global toggle did, exactly as `resolveMcpCallDisposition` documents. ──
			await stopPolicies.upsert(OWNER_ID, { ...DEFAULT_STOP_POLICY, approvalNeeded: true })

			const secondResponse = (await door.handle(post(toolCall(), authorized(token)))) as unknown as Response
			const secondBody = (await secondResponse.json()) as { result: { isError?: boolean; content: { text?: string }[] } }

			expect(secondBody.result.isError).toBe(true)
			// THE ASSERTION THAT CAN'T SILENTLY PASS FOR THE WRONG REASON: not "a new call happened", but
			// that NOTHING new executed — the count from Phase 1 is unchanged.
			expect(upstream.calls).toHaveLength(1)

			const stops = await raisedStops()
			expect(stops).toHaveLength(1)
			expect(stops[0]?.payload.kind).toBe(StopKind.APPROVAL_NEEDED)
			expect(stops[0]?.payload.issueId).toBe(ISSUE_ID)
		},
	)
})
