import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { TestBed, givenThread } from '@test/support'
import {
	AGENT_RUN_TOKEN_HEADER,
	AgentIdentityMiddleware,
	InMemoryAgentIdentityService,
	type BaseError,
	type HttpControllerRequest,
} from '@codm/core-typescript'
import { McpScope, ProviderKind, AgentModelId } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ConfigureModelController } from './ConfigureModel'

/**
 * THE MODEL IS CHOOSABLE FROM INSIDE THE CONVERSATION — AND ONLY FOR IT.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * Same two claims, and the same two reasons, as `ConfigurePrompt.test.ts`:
 *
 * PUBLISHED ≠ CALLABLE. `static mcpScopes` is what the golden snapshot proves, and it is also the very
 * line that makes `Controller.executeMiddlewares` append `AgentIdentityMiddleware` — a check that can
 * refuse the tool it just published. A tool the model can see and cannot call fails silently.
 *
 * THE FENCE IS THE GENERIC ONE. This controller carries NO ownership guard in `handle()`, because the
 * operation is addressed by the same key the run is confined to. That is an argument in a comment until
 * something measures it, so the foreign-thread case asserts the OTHER conversation's stored choice, not
 * merely the error: a refusal that still wrote would be the same defect wearing a 403.
 *
 * The chain is composed by hand rather than through `executeController` for the reason both sibling
 * suites document: `executeMiddlewares` resolves middlewares from the ROOT container while `TestBed`
 * binds `AgentIdentityService` on a CHILD one.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
describe('ConfigureModelController — choosable by the console AND from inside an orchestrator run', () => {
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

	const requestFor = (threadId: string, model: AgentModelId, token?: string): HttpControllerRequest<unknown> =>
		({
			...(token !== undefined && { headers: { [AGENT_RUN_TOKEN_HEADER]: token } }),
			params: { threadId },
			body: { provider: ProviderKind.CLAUDE_CODE, model },
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID },
		}) as unknown as HttpControllerRequest<unknown>

	/** An `orchestration` credential exactly as `OrchestratorAgent` mints one: thread-keyed, no issue. */
	const orchestrationRun = (threadId: string) => {
		const identities = new InMemoryAgentIdentityService()
		const token = identities.issue({
			scope: McpScope.orchestration,
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId,
			entryId: uuidv7(),
			expiresAt: new Date(Date.now() + 60_000),
		})
		return { identities, middleware: new AgentIdentityMiddleware(identities), token }
	}

	const storedModelOf = async (threadId: string) => (await testBed.resolve(ThreadRepository).findById(threadId))?.modelByProvider

	it('the CONSOLE path — no run token, the choice is written', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const request = requestFor(thread.id.value, AgentModelId.OPUS)

		await new AgentIdentityMiddleware(new InMemoryAgentIdentityService()).execute(request)
		const response = await testBed.resolve(ConfigureModelController).execute(request)

		expect(response.status).toBe(204)
		expect(await storedModelOf(thread.id.value)).toEqual({ [ProviderKind.CLAUDE_CODE]: AgentModelId.OPUS })
	})

	it('an ORCHESTRATION run token is ADMITTED — the tool the model holds actually writes the choice', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const { middleware, token } = orchestrationRun(thread.id.value)
		const request = requestFor(thread.id.value, AgentModelId.HAIKU, token)

		await middleware.execute(request)
		const response = await testBed.resolve(ConfigureModelController).execute(request)

		expect(response.status).toBe(204)
		expect(await storedModelOf(thread.id.value)).toEqual({ [ProviderKind.CLAUDE_CODE]: AgentModelId.HAIKU })
	})

	/**
	 * `DEFAULT` is the way BACK, and it must leave NO key behind. Asserting the stored map (not
	 * `modelFor`, which would answer `DEFAULT` either way) is what makes a mapper that starts persisting
	 * `DEFAULT` turn this red — the read side cannot see that bug at all.
	 */
	it('choosing DEFAULT erases the entry rather than storing it', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const { middleware, token } = orchestrationRun(thread.id.value)

		const write = requestFor(thread.id.value, AgentModelId.SONNET, token)
		await middleware.execute(write)
		await testBed.resolve(ConfigureModelController).execute(write)
		expect(await storedModelOf(thread.id.value)).toEqual({ [ProviderKind.CLAUDE_CODE]: AgentModelId.SONNET })

		const erase = requestFor(thread.id.value, AgentModelId.DEFAULT, token)
		await middleware.execute(erase)
		await testBed.resolve(ConfigureModelController).execute(erase)

		expect(await storedModelOf(thread.id.value)).toEqual({})
	})

	it("a run of ANOTHER thread cannot change this thread's model — refused, and the choice is untouched", async () => {
		const mine = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const foreign = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		await testBed.resolve(ConfigureModelController).execute(requestFor(foreign.id.value, AgentModelId.SONNET))

		const { middleware, token } = orchestrationRun(mine.id.value)
		const attack = requestFor(foreign.id.value, AgentModelId.HAIKU, token)

		const failure = await middleware.execute(attack).then(
			() => undefined,
			(error: unknown) => error as BaseError,
		)

		expect(failure?.name).toBe('FORBIDDEN')
		expect(await storedModelOf(foreign.id.value)).toEqual({ [ProviderKind.CLAUDE_CODE]: AgentModelId.SONNET })
	})

	it('a REVOKED run token is refused and the choice stays as it was', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed.resolve(ConfigureModelController).execute(requestFor(thread.id.value, AgentModelId.OPUS))

		const { identities, middleware, token } = orchestrationRun(thread.id.value)
		identities.revoke(token)

		const failure = await middleware.execute(requestFor(thread.id.value, AgentModelId.HAIKU, token)).then(
			() => undefined,
			(error: unknown) => error as BaseError,
		)

		expect(failure?.name).toBe('UNAUTHORIZED')
		expect(await storedModelOf(thread.id.value)).toEqual({ [ProviderKind.CLAUDE_CODE]: AgentModelId.OPUS })
	})

	/**
	 * The two domain refusals reach the DOOR, not just the entity — the console renders these codes.
	 * `CODEX` is the interesting one: it is a legal `ProviderKind` and a legal body, so nothing but the
	 * declared catalog can refuse it.
	 */
	it('refuses a provider this conversation does not run, and a model that provider does not offer', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, providers: [ProviderKind.CLAUDE_CODE] })
		const controller = testBed.resolve(ConfigureModelController)

		const unbound = {
			params: { threadId: thread.id.value },
			body: { provider: ProviderKind.CODEX, model: AgentModelId.OPUS },
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID },
		} as unknown as HttpControllerRequest<unknown>
		await expect(controller.execute(unbound)).rejects.toMatchObject({ name: 'PROVIDER_NOT_BOUND' })

		const bothBound = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			providers: [ProviderKind.CLAUDE_CODE, ProviderKind.CODEX],
		})
		const notOffered = {
			params: { threadId: bothBound.id.value },
			body: { provider: ProviderKind.CODEX, model: AgentModelId.OPUS },
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID },
		} as unknown as HttpControllerRequest<unknown>
		await expect(controller.execute(notOffered)).rejects.toMatchObject({ name: 'MODEL_NOT_AVAILABLE' })

		expect(await storedModelOf(thread.id.value)).toEqual({})
	})
})
