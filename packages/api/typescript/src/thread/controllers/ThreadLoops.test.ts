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
import { DayOfWeek, LoopScheduleKind, McpScope } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { LoopRepository } from '../repositories/LoopRepository'
import {
	CreateThreadLoopController,
	DeleteThreadLoopController,
	ListThreadLoopsController,
	SetThreadLoopEnabledController,
	UpdateThreadLoopController,
} from './ThreadLoops'

/**
 * THE LOOPS OF A CONVERSATION ARE SCHEDULABLE FROM INSIDE IT — AND ONLY ITS OWN.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS SUITE EXISTS AT ALL. `static mcpScopes` publishes the five tools and the golden snapshot
 * proves they are published; PUBLISHED and CALLABLE are two different claims, because the very line
 * that opens a tool makes `Controller.executeMiddlewares` append `AgentIdentityMiddleware`, which is a
 * check that can refuse it. A tool the model can see and cannot call is a silent failure.
 *
 * AND THE CONFINEMENT HERE HAS TWO HALVES, WHICH IS WHAT MAKES IT WORTH MEASURING RATHER THAN
 * ASSERTING IN PROSE. Every one of the five paths starts at `/threads/:threadId/loops`, so the generic
 * `compareIdentity` refuses another conversation before any controller is entered — that is the first
 * half, and it is the same one `ConfigurePrompt.test.ts` pins. The three per-loop doors carry a SECOND
 * key the identity does not carry (`loopId`), and there `compareIdentity` has nothing to disagree with:
 * what refuses is `loadLoop()` in `ManageThreadLoops`, written for the console because loop ids are
 * addressable from it. Neither half is code this frente wrote, and both are asserted below by reading
 * the victim's state back — a refusal that still wrote would be the same defect wearing a 403.
 *
 * WHY THE CHAIN IS COMPOSED BY HAND INSTEAD OF GOING THROUGH `executeController`
 * MEASURED, and the same wall `ConfigurePrompt.test.ts` and `ResolveStop.test.ts` document:
 * `executeMiddlewares` resolves middleware classes from the ROOT container while `TestBed` binds
 * `AgentIdentityService` on a CHILD one, so under `executeController` the root would resolve the
 * ABSTRACT service into an instance with no `issue`/`resolve` at all. The APPEND itself is core's own
 * property and core's own test.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
describe('ThreadLoops controllers — schedulable by the console AND from inside an orchestrator run', () => {
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

	const DAILY = {
		kind: LoopScheduleKind.DAILY,
		timeOfDay: '09:00',
		weekdays: [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY],
		timezone: 'America/Sao_Paulo',
	}
	const INTERVAL = { kind: LoopScheduleKind.INTERVAL, everyMinutes: 15 }
	const PROMPT = 'Pergunte ao time como está o deploy de hoje.'

	const requestFor = (
		params: Record<string, string>,
		body: Record<string, unknown> | undefined,
		token?: string,
	): HttpControllerRequest<unknown> =>
		({
			...(token !== undefined && { headers: { [AGENT_RUN_TOKEN_HEADER]: token } }),
			params,
			body: body ?? {},
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

	const loopsOf = async (threadId: string) => testBed.resolve(LoopRepository).listByThread(threadId)

	/** The console's own create — no run token anywhere, which is the path AC-9 is about. */
	const seedLoop = async (threadId: string, schedule: Record<string, unknown> = DAILY): Promise<string> => {
		const request = requestFor({ threadId }, { prompt: PROMPT, schedule })
		const response = await testBed.resolve(CreateThreadLoopController).execute(request)
		return (response.data as { loopId: string }).loopId
	}

	/**
	 * THE DOOR ITSELF — and this assertion is what makes every other one in this file mean something.
	 *
	 * The rest of the suite composes the chain BY HAND, so it proves that the fences hold when
	 * `AgentIdentityMiddleware` runs. What it cannot show is that the middleware runs AT ALL: in
	 * production nothing lists it, `Controller.effectiveMiddlewares` APPENDS it, and it does so on
	 * exactly one condition — that the class declares a non-empty `static mcpScopes`. So for a
	 * controller with no scope, an agent run token reaching it would be checked by nobody, and a suite
	 * that hand-built the middleware would still be green while measuring a guard the runtime never
	 * installs.
	 *
	 * Declaring the scope is therefore two things at once: the tool becomes callable, and the check that
	 * confines it becomes mounted. This line pins both, and it is the one assertion here that is RED
	 * before the exposure change. `mcp-exposure.test.ts` asks a different question — whether the PUBLISHED
	 * artifact agrees with the scan — and neither covers the other.
	 */
	it('AC-1 — all five declare `orchestration`, which is what mounts the identity check below', () => {
		for (const controller of [
			ListThreadLoopsController,
			CreateThreadLoopController,
			UpdateThreadLoopController,
			SetThreadLoopEnabledController,
			DeleteThreadLoopController,
		]) {
			expect(controller.mcpScopes ?? []).toContain(McpScope.orchestration)
		}
		// AC-2 — and the read keeps the console/external surface it already had, alone among the five.
		expect(ListThreadLoopsController.mcpScopes ?? []).toContain(McpScope.system)
		for (const controller of [
			CreateThreadLoopController,
			UpdateThreadLoopController,
			SetThreadLoopEnabledController,
			DeleteThreadLoopController,
		]) {
			expect(controller.mcpScopes ?? []).not.toContain(McpScope.system)
		}
	})

	it('AC-9 — the CONSOLE path is untouched: no run token, the loop is still scheduled', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const request = requestFor({ threadId: thread.id.value }, { prompt: PROMPT, schedule: DAILY })

		await new AgentIdentityMiddleware(new InMemoryAgentIdentityService()).execute(request)
		const response = await testBed.resolve(CreateThreadLoopController).execute(request)

		expect(response.status).toBe(201)
		expect(await loopsOf(thread.id.value)).toHaveLength(1)
	})

	/**
	 * AC-4 — BOTH members of the union arrive intact, which is the half of the contract a flattened
	 * body would silently break: an `INTERVAL` loop that came back carrying `timeOfDay` would be a row
	 * lying about what it is, and the discriminant is the only thing standing between the two.
	 */
	it('AC-4 — an ORCHESTRATION run schedules a DAILY loop and an INTERVAL loop, each with its own shape', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const { middleware, token } = orchestrationRun(thread.id.value)

		for (const schedule of [DAILY, INTERVAL]) {
			const request = requestFor({ threadId: thread.id.value }, { prompt: PROMPT, schedule }, token)
			await middleware.execute(request)
			const response = await testBed.resolve(CreateThreadLoopController).execute(request)
			expect(response.status).toBe(201)
		}

		const stored = await loopsOf(thread.id.value)
		expect(stored).toHaveLength(2)
		const kinds = stored.map(loop => loop.schedule.kind).sort()
		expect(kinds).toEqual([LoopScheduleKind.DAILY, LoopScheduleKind.INTERVAL].sort())
		const interval = stored.find(loop => loop.schedule.kind === LoopScheduleKind.INTERVAL)
		expect(interval?.schedule).toMatchObject({ everyMinutes: 15 })
	})

	/**
	 * AC-5 — THE LIFECYCLE, in one test on purpose: it is one operator changing their mind four times,
	 * and splitting it into four would assert four states without ever asserting that they follow each
	 * other. `nextRunAt` is the field that carries the difference between paused and live — absent iff
	 * paused — so it, and not `enabled` alone, is what each step reads back.
	 */
	it('AC-5 — the same run reads, edits, pauses, resumes and removes a loop of its own conversation', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const loopId = await seedLoop(thread.id.value)
		const { middleware, token } = orchestrationRun(thread.id.value)

		const list = requestFor({ threadId: thread.id.value }, undefined, token)
		await middleware.execute(list)
		const listed = await testBed.resolve(ListThreadLoopsController).execute(list)
		expect((listed.data as { loops: { loopId: string }[] }).loops.map(l => l.loopId)).toEqual([loopId])

		const edit = requestFor({ threadId: thread.id.value, loopId }, { prompt: 'Outro texto.', schedule: INTERVAL }, token)
		await middleware.execute(edit)
		await testBed.resolve(UpdateThreadLoopController).execute(edit)
		expect((await loopsOf(thread.id.value))[0]?.schedule).toMatchObject({ kind: LoopScheduleKind.INTERVAL, everyMinutes: 15 })

		const pause = requestFor({ threadId: thread.id.value, loopId }, { enabled: false }, token)
		await middleware.execute(pause)
		await testBed.resolve(SetThreadLoopEnabledController).execute(pause)
		expect((await loopsOf(thread.id.value))[0]?.nextRunAt).toBeUndefined()

		const resume = requestFor({ threadId: thread.id.value, loopId }, { enabled: true }, token)
		await middleware.execute(resume)
		await testBed.resolve(SetThreadLoopEnabledController).execute(resume)
		expect((await loopsOf(thread.id.value))[0]?.nextRunAt).toBeDefined()

		const remove = requestFor({ threadId: thread.id.value, loopId }, undefined, token)
		await middleware.execute(remove)
		await testBed.resolve(DeleteThreadLoopController).execute(remove)
		expect(await loopsOf(thread.id.value)).toHaveLength(0)
	})

	/**
	 * AC-6 — THE FIRST FENCE, and it is the GENERIC one. The operation is addressed by the same key the
	 * run is confined to, so the refusal happens before the controller exists in the call stack.
	 * Asserting B's surviving loop, not only the error name, is what makes removing the confinement —
	 * or re-addressing these endpoints by something the identity does not carry — turn THIS line red
	 * instead of a comment stale.
	 */
	it("AC-6 — a run of ANOTHER conversation cannot touch this one's loops, and they survive", async () => {
		const mine = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const foreign = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const foreignLoop = await seedLoop(foreign.id.value)

		const { middleware, token } = orchestrationRun(mine.id.value)
		const attack = requestFor({ threadId: foreign.id.value, loopId: foreignLoop }, undefined, token)

		const failure = await middleware.execute(attack).then(
			() => undefined,
			(error: unknown) => error as BaseError,
		)

		expect(failure?.name).toBe('FORBIDDEN')
		expect(await loopsOf(foreign.id.value)).toHaveLength(1)
	})

	/**
	 * AC-7 — THE SECOND FENCE, and the one the identity cannot draw. The path names THIS run's thread,
	 * so `compareIdentity` is satisfied and the middleware admits the call; what refuses is `loadLoop()`,
	 * which asks whether the loop is that thread's before touching it. Written for the console — a loop
	 * id is addressable from there too — and inherited here for free, which is precisely the claim.
	 */
	it('AC-7 — a real loop id belonging to ANOTHER conversation is refused by the use case, and survives', async () => {
		const mine = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const foreign = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const foreignLoop = await seedLoop(foreign.id.value)

		const { middleware, token } = orchestrationRun(mine.id.value)
		const attack = requestFor({ threadId: mine.id.value, loopId: foreignLoop }, undefined, token)

		// The middleware ADMITS it — the thread in the path is this run's own. That is the point.
		await middleware.execute(attack)
		const failure = await testBed
			.resolve(DeleteThreadLoopController)
			.execute(attack)
			.then(
				() => undefined,
				(error: unknown) => error as BaseError,
			)

		expect(failure?.name).toBe('LOOP_NOT_FOUND')
		expect(await loopsOf(foreign.id.value)).toHaveLength(1)
	})

	/**
	 * AC-8 — a DEAD run schedules NOTHING. "No token" means the console and is deliberately admitted;
	 * "a token that is present and revoked" means a late call from a run that already ended, and the two
	 * must not resolve to the same verdict.
	 */
	it('AC-8 — a REVOKED run token is refused and no loop is created', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const { identities, middleware, token } = orchestrationRun(thread.id.value)
		identities.revoke(token)

		const request = requestFor({ threadId: thread.id.value }, { prompt: PROMPT, schedule: DAILY }, token)
		const failure = await middleware.execute(request).then(
			() => undefined,
			(error: unknown) => error as BaseError,
		)

		expect(failure?.name).toBe('UNAUTHORIZED')
		expect(await loopsOf(thread.id.value)).toHaveLength(0)
	})
})
