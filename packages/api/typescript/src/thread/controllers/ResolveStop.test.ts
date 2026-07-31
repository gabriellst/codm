import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { TestBed, givenStop, givenThread } from '@test/support'
import {
	AGENT_RUN_TOKEN_HEADER,
	AgentIdentityMiddleware,
	InMemoryAgentIdentityService,
	type BaseError,
	type HttpControllerRequest,
} from '@codm/core-typescript'
import { McpScope, StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ResolveStopController } from './ResolveStop'

/**
 * THE DOOR IS REACHABLE FROM INSIDE AN ORCHESTRATOR RUN (issue-resume spec, decision 1).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS ASSERTED AND NOT READ OFF THE CLASS
 * `static mcpScopes` publishes the tool and the golden snapshot proves it is published. PUBLISHED and
 * CALLABLE are two different claims: the same line that opens the tool makes
 * `Controller.executeMiddlewares` append `AgentIdentityMiddleware`, which is a check that can refuse
 * it. A tool the model can see and cannot call is a silent failure, so the destination-side check is
 * run here against a real `orchestration` credential rather than reasoned about.
 *
 * WHY THE MIDDLEWARE IS COMPOSED BY HAND INSTEAD OF GOING THROUGH `executeController`
 * MEASURED: `executeMiddlewares` resolves middleware classes from the ROOT container, while `TestBed`
 * binds `AgentIdentityService` on a CHILD one — so under `executeController` the root resolves the
 * ABSTRACT service class into an instance with no `issue`/`resolve` at all. Building the two steps the
 * chain performs (the identity check, then the controller) keeps the credential and the middleware on
 * the same service instance without registering a fake on the root container, which would leak into
 * every other suite in the process. The APPEND itself is core's own property and core's own test.
 *
 * THE TOKEN-LESS CASE IS NOT DECORATION: `AgentIdentityMiddleware` is deliberately not fail-closed
 * because the console operator carries no run token, and this controller is now BOTH callers — the
 * console button and the orchestrator's tool.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
describe('ResolveStopController — reachable by the console AND from inside an orchestrator run', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const requestFor = (stopId: string, resolution: StopResolution, token?: string): HttpControllerRequest<unknown> =>
		({
			...(token !== undefined && { headers: { [AGENT_RUN_TOKEN_HEADER]: token } }),
			params: { stopId },
			body: { resolution },
			ctx: { ownerId: OPERATOR_ID },
		}) as unknown as HttpControllerRequest<unknown>

	/** An `orchestration` credential exactly as `OrchestratorAgent` mints one: thread-keyed, no issue. */
	const orchestrationRun = (threadId: string) => {
		const identities = new InMemoryAgentIdentityService()
		const token = identities.issue({
			scope: McpScope.orchestration,
			ownerId: OPERATOR_ID,
			threadId,
			entryId: uuidv7(),
			expiresAt: new Date(Date.now() + 60_000),
		})
		return { identities, middleware: new AgentIdentityMiddleware(identities), token }
	}

	it('the CONSOLE path is untouched — no run token, the stop still resolves', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const stop = await givenStop(testBed, { threadId: thread.id.value, kind: StopKind.HUMAN_REQUESTED })
		const request = requestFor(stop.stopId, StopResolution.REVIEW_AND_SEND)

		await new AgentIdentityMiddleware(new InMemoryAgentIdentityService()).execute(request)
		const response = await testBed.resolve(ResolveStopController).execute(request)

		expect(response.status).toBe(204)
		const resolved = await testBed.resolve(ThreadRepository).findStop(stop.stopId)
		expect(resolved?.resolution).toBe(StopResolution.REVIEW_AND_SEND)
	})

	it('an ORCHESTRATION run token is ADMITTED — the tool the model holds actually resolves the stop', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const stop = await givenStop(testBed, { threadId: thread.id.value, kind: StopKind.APPROVAL_NEEDED })
		const { middleware, token } = orchestrationRun(thread.id.value)
		const request = requestFor(stop.stopId, StopResolution.APPROVE, token)

		await middleware.execute(request)
		const response = await testBed.resolve(ResolveStopController).execute(request)

		expect(response.status).toBe(204)
		const resolved = await testBed.resolve(ThreadRepository).findStop(stop.stopId)
		expect(resolved?.resolution).toBe(StopResolution.APPROVE)
	})

	/**
	 * THE HOLE THE `orchestration` SCOPE OPENED, and the reason `handle()` has an ownership check at all.
	 *
	 * The identity confines `threadId`; the request carries `{ stopId, resolution }`. `compareIdentity`
	 * walks the keys the IDENTITY has against `{...params, ...body}` — and NONE of them appears there, so
	 * the middleware finds nothing to disagree with and admits the call. Every other `orchestration` entry
	 * is thread-shaped (`ForkIssue`, `GetSessionIssues` take `threadId`; `GetIssueStatus` and
	 * `SteerIssueTurn` check ownership themselves); this one was the exception, and a stop is addressed by
	 * a uuid that any run could name.
	 *
	 * ASSERTING THE STOP, NOT ONLY THE ERROR: a refusal that still wrote would be the same bug wearing a
	 * 403. Removing the guard from `handle()` must make THIS line red with the stop closed, not merely the
	 * code line red.
	 */
	it("a run of ANOTHER thread cannot close this thread's stop — refused, and the stop stays open", async () => {
		const mine = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const foreign = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const stop = await givenStop(testBed, { threadId: foreign.id.value, kind: StopKind.APPROVAL_NEEDED })
		const { middleware, token } = orchestrationRun(mine.id.value)
		const request = requestFor(stop.stopId, StopResolution.APPROVE, token)

		// The middleware ADMITS it — that is the finding, and it is measured here rather than asserted
		// away: the boundary this test defends could not live in `compareIdentity`.
		await middleware.execute(request)
		const failure = await testBed
			.resolve(ResolveStopController)
			.execute(request)
			.then(
				() => undefined,
				(error: unknown) => error as BaseError,
			)

		const stillOpen = await testBed.resolve(ThreadRepository).findStop(stop.stopId)
		expect(stillOpen?.resolution).toBeUndefined()
		expect(stillOpen?.resolvedAt).toBeUndefined()
		expect(failure?.name).toBe('AGENT_RUN_SCOPE_MISMATCH')
	})

	/**
	 * A DEAD run writes NOTHING — the half of the auto-appended middleware that is a boundary rather
	 * than a pass-through. "No token" means the console; "a token that is present and revoked" means a
	 * late call from a run that already ended, and the two must not resolve to the same verdict.
	 */
	it('a REVOKED run token is refused and the stop stays open', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const stop = await givenStop(testBed, { threadId: thread.id.value, kind: StopKind.APPROVAL_NEEDED })
		const { identities, middleware, token } = orchestrationRun(thread.id.value)
		identities.revoke(token)

		const failure = await middleware.execute(requestFor(stop.stopId, StopResolution.APPROVE, token)).then(
			() => undefined,
			(error: unknown) => error as BaseError,
		)

		expect(failure?.name).toBe('UNAUTHORIZED')
		const stillOpen = await testBed.resolve(ThreadRepository).findStop(stop.stopId)
		expect(stillOpen?.resolution).toBeUndefined()
		expect(stillOpen?.resolvedAt).toBeUndefined()
	})
})
