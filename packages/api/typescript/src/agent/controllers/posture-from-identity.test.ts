import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import {
	AGENT_RUN_TOKEN_HEADER,
	AgentIdentityMiddleware,
	InMemoryAgentIdentityService,
	type BaseError,
	type HttpControllerRequest,
} from '@codm/core-typescript'
import { MailboxItemKind, McpScope, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from '../repositories/MailboxRepository'
import { ForkIssueController } from './ForkIssue'
import { SteerIssueTurnController } from './SteerIssueTurn'

// Only `url` + `raw` are required by the request type beyond what each case sets.
const RAW = new Request('http://localhost/invariant')

/**
 * INVARIANT (participant-permission-posture, Decision 6 / AC-6): the posture of work queued from inside
 * a turn comes ONLY from `ctx.agentIdentity` — the run token — never from a tool argument. A model that
 * could pass `posture: 'BYPASS'` would elevate itself.
 *
 * Two lines of defence, both pinned:
 *  1. The controller reads `identity.posture`; a `posture` smuggled into `body` is never read. FALSIFIER:
 *     change `ForkIssueController.handle` to `posture: (request.body as { posture?: PermissionPosture }).posture ?? identity.posture`
 *     and the first and third cases go RED (the WORK item becomes BYPASS under an AUTO token; AUTO under a BYPASS one).
 *  2. Through the real middleware, a `posture` argument that contradicts the token is refused outright
 *     (`compareIdentity` walks the identity's keys, and `posture` is one of them) — nothing is queued.
 */
describe('INVARIANT — a tool argument cannot set the posture', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const identity = (threadId: string, posture: PermissionPosture) => ({
		ownerId: MOCK_CLOUD_OWNER_ID,
		threadId,
		entryId: uuidv7(),
		scope: McpScope.orchestration,
		posture,
	})

	const queued = async () => {
		const item = await testBed.resolve(MailboxRepository).claimNext('invariant-test', 60_000)
		return item
	}

	it('ForkIssue — an AUTO token with `posture: BYPASS` in the body queues AUTO', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		// Wider than the declared body: the runtime shape a model could still send.
		const fork1 = { goal: 'grava em produção', posture: PermissionPosture.BYPASS }

		await testBed.resolve(ForkIssueController).handle({
			url: RAW.url,
			raw: RAW,
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID, agentIdentity: identity(thread.id.value, PermissionPosture.AUTO) },
			params: { threadId: thread.id.value },
			body: fork1,
		})

		const item = await queued()
		expect(item?.kind).toBe(MailboxItemKind.WORK)
		expect(item?.posture).toBe(PermissionPosture.AUTO)
	})

	it('SteerIssueTurn — an AUTO token with `posture: BYPASS` in the body queues AUTO', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'moeda' })

		const steer = { text: 'pode gravar', posture: PermissionPosture.BYPASS }

		await testBed.resolve(SteerIssueTurnController).handle({
			url: RAW.url,
			raw: RAW,
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID, agentIdentity: identity(thread.id.value, PermissionPosture.AUTO) },
			params: { threadId: thread.id.value, issueId: issue.id.value },
			body: steer,
		})

		expect((await queued())?.posture).toBe(PermissionPosture.AUTO)
	})

	it('the token is the source in BOTH directions — a BYPASS token with `posture: AUTO` in the body queues BYPASS', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		// Wider than the declared body: the runtime shape a model could still send.
		const fork2 = { goal: 'troca a moeda', posture: PermissionPosture.AUTO }

		await testBed.resolve(ForkIssueController).handle({
			url: RAW.url,
			raw: RAW,
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID, agentIdentity: identity(thread.id.value, PermissionPosture.BYPASS) },
			params: { threadId: thread.id.value },
			body: fork2,
		})

		expect((await queued())?.posture).toBe(PermissionPosture.BYPASS)
	})

	it('through the real middleware, a contradicting `posture` argument is REFUSED and nothing is queued', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const identities = new InMemoryAgentIdentityService()
		const token = identities.issue({ ...identity(thread.id.value, PermissionPosture.AUTO), expiresAt: new Date(Date.now() + 60_000) })
		const smuggled = { goal: 'grava em produção', posture: PermissionPosture.BYPASS }
		const request: HttpControllerRequest<unknown> = {
			headers: { [AGENT_RUN_TOKEN_HEADER]: token },
			params: { threadId: thread.id.value },
			body: smuggled,
			url: RAW.url,
			raw: RAW,
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID },
		}

		const failure = await new AgentIdentityMiddleware(identities).execute(request).then(
			() => undefined,
			(error: unknown) => error as BaseError,
		)

		expect(failure?.name).toBe('FORBIDDEN')
		expect(await queued()).toBeUndefined()
	})
})
