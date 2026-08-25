# Loops da thread acionáveis via MCP do orquestrador — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** O operador agenda, edita, pausa, retoma e remove os prompts recorrentes de uma conversa falando nela — e o que ele ditou é o mesmo loop que ele vê no `LoopsSection` e que a varredura `FireDueLoops` dispara.

**Architecture:** Nenhuma entidade, use case, schema de operação, migração ou endpoint novo. As cinco portas de `thread/controllers/ThreadLoops.ts` passam a declarar `McpScope.orchestration` (a leitura somando ao `system` que já tem), e o confinamento vem inteiro de código que já existe: o `AgentIdentityMiddleware` — auto-aplicado porque a classe declarou `mcpScopes` — recusa outra thread pelo `threadId` do path, e `loadLoop()` em `ManageThreadLoops` já recusa um `loopId` que não seja daquela thread. O `OrchestratorPromptBuilder` ganha a situação sancionada que falta, e `OrchestratorInputSchema` ganha o único fato que o modelo não tem como derivar: o fuso da máquina, sem o qual o membro `DAILY` da agenda é inalcançável. O resto é regeneração de artefato e os rails que provam a mudança nos dois sentidos.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe, Zod, Kubb/MCP

**Spec:** .specs/2026-08-05-loops-acionaveis-via-mcp-design.md
**Tasks:** 3
**Estimated minutes:** 95

---

## Task T1: As cinco portas de loop abrem para o orquestrador, confinadas à própria conversa

**Files to write:**
- Modify: `packages/api/typescript/src/thread/controllers/ThreadLoops.ts` — `static mcpScopes` nas cinco classes (`ListThreadLoops` soma `orchestration` ao `system`; as quatro escritas ganham só `orchestration`), mais o bloco de doc que registra por que o confinamento tem duas metades e nenhuma delas é código novo
- Test: `packages/api/typescript/src/thread/controllers/ThreadLoops.test.ts` (novo) — as cinco são chamáveis de dentro de um run `orchestration`, e só sobre a própria thread e os loops dela

**Files to read:**
- `packages/api/typescript/src/thread/controllers/ConfigurePrompt.test.ts` — o molde exato desta suíte (cadeia composta à mão, credencial `orchestration`, contra-prova de thread alheia lendo o estado de volta pelo repositório)
- `packages/api/typescript/src/thread/usecases/ManageThreadLoops.ts` — `loadLoop()`, o guard que fecha o eixo `loopId`
- `packages/api/typescript/src/thread/repositories/LoopRepository/LoopRepository.ts` — `findById` / `listByThread`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller, /test
**Depends on:** (none)
**Consumes (frozen):** `McpScope` (membros `system`, `orchestration`), `DayOfWeek`, `LoopScheduleKind` de `@codm/contracts-typescript/wire/enums`; `AGENT_RUN_TOKEN_HEADER`, `AgentIdentityMiddleware`, `InMemoryAgentIdentityService`, `HttpControllerRequest`, `BaseError`, `Controller`, `HttpStatusCode`, `z` de `@codm/core-typescript`; `TestBed`, `givenThread` de `@test/support`; `LoopRepository` de `../repositories/LoopRepository`; `OPERATOR_ID` de `@auth/operator`; `ThreadParam` de `../schemas`; os use cases e schemas já exportados por `../usecases/ManageThreadLoops` e `../usecases/ListThreadLoops`.
**Scope fence:** DONE elsewhere — nada. OUT — o prompt do orquestrador e o campo `timezone` (T2 é dono), a regen de `openapi.json`/SDK e o snapshot dourado (T3). **Não** adicione guard de ownership em nenhum `handle()`: o confinamento desta frente é inteiramente pré-existente (middleware para `threadId`, `loadLoop()` para `loopId`), e um guard redundante apagaria exatamente a propriedade que a spec está afirmando. **Não** mexa nos use cases, nem no `Loop`, nem no `LoopSchedule`, nem no console.
**Gate:** `cd packages/api/typescript && bun test src/thread/controllers/ThreadLoops.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T1.1 — Escrever a suíte que falha

Crie `packages/api/typescript/src/thread/controllers/ThreadLoops.test.ts`. Compõe a cadeia à mão (middleware + controller) em vez de passar por `executeController`, pelo motivo já documentado em `ConfigurePrompt.test.ts`: `executeMiddlewares` resolve middlewares do container RAIZ, enquanto o `TestBed` liga `AgentIdentityService` num container FILHO.

Cobertura obrigatória, sempre lendo o estado de volta pelo `LoopRepository` — nunca só o status da resposta:

- **AC-9** — sem run token (console): cria.
- **AC-4** — credencial `orchestration` da própria thread: cria um loop `DAILY` e um `INTERVAL`, e a agenda lida de volta é a que foi enviada.
- **AC-5** — a mesma credencial edita, pausa, retoma e apaga, com o efeito lido de volta a cada passo.
- **AC-6** — credencial da thread A mirando a thread B: `middleware.execute` rejeita com `FORBIDDEN`, o controller **nunca** é chamado, e os loops de B continuam lá.
- **AC-7** — credencial da thread A, path da thread A, mas um `loopId` REAL da thread B: o middleware **admite** (a thread bate) e o use case recusa com `LOOP_NOT_FOUND` — e o loop de B continua existindo. Este é o caso que prova a Decisão 4(b): se alguém trocar `loadLoop()` por um `findById` cru, esta linha fica vermelha.
- **AC-8** — token revogado: `UNAUTHORIZED`, e nada muda.

```typescript
// packages/api/typescript/src/thread/controllers/ThreadLoops.test.ts — COMPLETE final file
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
import { OPERATOR_ID } from '@auth/operator'
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
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
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

	const loopsOf = async (threadId: string) => testBed.resolve(LoopRepository).listByThread(threadId)

	/** The console's own create — no run token anywhere, which is the path AC-9 is about. */
	const seedLoop = async (threadId: string, schedule: Record<string, unknown> = DAILY): Promise<string> => {
		const request = requestFor({ threadId }, { prompt: PROMPT, schedule })
		const response = await testBed.resolve(CreateThreadLoopController).execute(request)
		return (response.data as { loopId: string }).loopId
	}

	it('AC-9 — the CONSOLE path is untouched: no run token, the loop is still scheduled', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
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
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
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
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
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
		const mine = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const foreign = await givenThread(testBed, { ownerId: OPERATOR_ID })
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
	it("AC-7 — a real loop id belonging to ANOTHER conversation is refused by the use case, and survives", async () => {
		const mine = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const foreign = await givenThread(testBed, { ownerId: OPERATOR_ID })
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
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
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
```

### Step T1.2 — Rodar a suíte e ver o vermelho

Run: `cd packages/api/typescript && bun test src/thread/controllers/ThreadLoops.test.ts`
Expected: FAIL — **um** caso, `AC-1 — all five declare orchestration`, com `Expected to contain: "orchestration" / Received: [ "system" ]`.

E os outros seis passam desde já, o que é uma informação e não um defeito da suíte: `AgentIdentityMiddleware` não olha o escopo do token, só a validade e as chaves da identidade, e esta suíte compõe a cadeia à mão. Ou seja, os seis medem que as DUAS cercas seguram — e elas já seguravam antes desta frente, porque nenhuma das duas é código que ela escreve. O que a declaração muda é que a cerca passa a estar MONTADA: `Controller.effectiveMiddlewares` só anexa o middleware quando `static mcpScopes` é não-vazio, então numa porta sem escopo um run token chegaria sem ser conferido por ninguém. É por isso que o AC-1 mora aqui e não só em `mcp-exposure.test.ts`: aquele arquivo pergunta se o artefato PUBLICADO concorda com a varredura, este pergunta se o guard que os outros seis exercitam existe em produção. Nenhum dos dois cobre o outro.

### Step T1.3 — Abrir as cinco portas

Escreva o arquivo abaixo por cima de `ThreadLoops.ts`.

```typescript
// packages/api/typescript/src/thread/controllers/ThreadLoops.ts — COMPLETE final file
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { DayOfWeek, LoopScheduleKind, McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import {
	CreateThreadLoop,
	CreateThreadLoopInputSchema,
	CreateThreadLoopOutputSchema,
	DeleteThreadLoop,
	DeleteThreadLoopOutputSchema,
	SetThreadLoopEnabled,
	SetThreadLoopEnabledInputSchema,
	SetThreadLoopEnabledOutputSchema,
	UpdateThreadLoop,
	UpdateThreadLoopInputSchema,
	UpdateThreadLoopOutputSchema,
} from '../usecases/ManageThreadLoops'
import { ListThreadLoops, ListThreadLoopsOutputSchema } from '../usecases/ListThreadLoops'
import { ThreadParam } from '../schemas'

/**
 * The HTTP surface of thread LOOPS — `/threads/:threadId/loops`, the five doors the console needs.
 *
 * One file for the five, mirroring the use cases they call: they share the `:threadId/:loopId`
 * envelope and each body is two lines. Splitting them would produce five files whose only distinct
 * content is a path string.
 *
 * ### THE MCP EXPOSURE OF ALL FIVE, ARGUED ONCE HERE RATHER THAN FIVE TIMES BELOW
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * `orchestration` IS NEW ON EVERY ONE OF THEM, and it answers a request the product could not serve:
 * the operator asks for a recurring prompt IN the conversation ("todo dia de manhã me pergunta como
 * está o deploy") and the only door to it was the console. A model with the request and no sanctioned
 * tool does not go quiet — it narrates. That failure is measured, in this repository, for the steer
 * and for the custom prompt, both of which were missing the same way.
 *
 * ALL FIVE, and the READ is what makes the other four reachable at all. An `orchestration` identity
 * carries `threadId` and nothing loop-shaped, and the prompt renders no loop list, so a model that
 * could only CREATE would be able to set alarms and unable to turn any of them off. `ListThreadLoops`
 * is how it learns an id, which is why it gains the scope rather than staying a console read.
 *
 * `system` DOES NOT CHANGE — the reads stay, the writes stay out. That asymmetry is not an oversight
 * being corrected here: it is the deliberate posture this file already carried ("READ only — the
 * writes below stay off the door"), and it stays true because `system` is the EXTERNAL MCP client,
 * which carries no run token and therefore has no conversation to be confined to. `orchestration`
 * does. Widening `system` is a second exposure decision, and it is recorded as a follow-up in the
 * spec rather than smuggled in with this one.
 *
 * `issue-handling` IS OUT. The agent that executes an issue reads third-party text as its input, and
 * programming recurring whispers into a conversation is not issue work. `IssueWorkAgent.test.ts` still
 * pins that no `system` tool reaches it, and that assertion is untouched by these lines.
 *
 * ### NO OWNERSHIP GUARD IN ANY `handle()`, DELIBERATELY — THE FENCE IS TWO PIECES THAT EXIST
 *  1. THE CONVERSATION. Every path starts at `/threads/:threadId/loops`; an `orchestration` identity
 *     carries `threadId` (`OrchestratorAgent.IdentitySchema` omits only `issueId`); and
 *     `AgentIdentityMiddleware` — appended precisely BECAUSE these classes declare `mcpScopes` —
 *     compares the keys the identity carries against `{...params, ...body}`. Another conversation's
 *     loops are a 403 before `handle()` is entered.
 *  2. THE LOOP. The three per-loop doors carry a `loopId` the identity does NOT carry, so
 *     `compareIdentity` has nothing to say about it — and does not need to: `loadLoop()` in
 *     `ManageThreadLoops` already refuses a loop whose `ownerId`/`threadId` are not the caller's, a
 *     guard written for the console for the identical reason (loop ids are addressable from there
 *     too). Adding a second check here would hide the fact that the existing one is doing the work.
 *
 * `ThreadLoops.test.ts` measures both halves by reading the victim's loops back, not merely the error.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */

const OWNER = '00000000-0000-4000-8000-000000000001'
const THREAD = '019e4d24-6524-7041-9e1c-8108180cddae'
const LOOP = '019e4d24-6524-7041-9e1c-8108180cddb1'
/**
 * The example schedule the create door shows: weekday mornings, in the operator's own zone.
 *
 * The EDIT door shows the other member instead (below), so the generated docs and SDK examples carry
 * one of each — a reader who only ever sees the wall-clock shape would reasonably conclude it is the
 * only one, which is precisely the misreading a discriminated contract exists to prevent. Now that a
 * MODEL reads these examples out of the generated tool definition, that reasoning is load-bearing
 * rather than editorial.
 */
const SCHEDULE = {
	kind: LoopScheduleKind.DAILY as const,
	timeOfDay: '09:00',
	weekdays: [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY],
	timezone: 'America/Sao_Paulo',
}

/** "A cada quinze minutos" — the cadence member, with no clock and no zone. */
const INTERVAL_SCHEDULE = { kind: LoopScheduleKind.INTERVAL, everyMinutes: 15 } as const
const PROMPT = 'Pergunte ao time como está o deploy de hoje e resuma em três linhas.'

/** The (ctx.ownerId, params.{threadId,loopId}) envelope the per-loop doors share. */
const LoopParam = ThreadParam.extend({ params: z.object({ threadId: z.uuid(), loopId: z.uuid() }) })

export const ListThreadLoopsControllerInputSchema = ThreadParam.example([{ ctx: { ownerId: OWNER }, params: { threadId: THREAD } }])
export const ListThreadLoopsControllerOutputSchema = ListThreadLoopsOutputSchema

// T11
@injectable()
export class ListThreadLoopsController extends Controller<
	typeof ListThreadLoopsControllerInputSchema,
	typeof ListThreadLoopsControllerOutputSchema
> {
	/** Both surfaces: `system` so an external client can answer "o que está agendado nesta conversa?",
	 *  and `orchestration` because it is the ONLY way the resident agent learns a loop id — without it
	 *  the four writes below are addressable by nobody. See the exposure block at the top of the file. */
	static override readonly mcpScopes = [McpScope.system, McpScope.orchestration]
	readonly path = '/threads/:threadId/loops'
	readonly method = 'get' as const
	readonly description = "This conversation's scheduled prompts (loops) (T11)"
	readonly inputSchema = ListThreadLoopsControllerInputSchema
	readonly outputSchema = ListThreadLoopsControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private query: ListThreadLoops) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId })
		return { status: HttpStatusCode.OK, data }
	}
}

export const CreateThreadLoopControllerInputSchema = ThreadParam.extend({
	body: CreateThreadLoopInputSchema.pick({ prompt: true, schedule: true }),
}).example([{ ctx: { ownerId: OWNER }, params: { threadId: THREAD }, body: { prompt: PROMPT, schedule: SCHEDULE } }])
export const CreateThreadLoopControllerOutputSchema = CreateThreadLoopOutputSchema.example([
	{ loopId: LOOP, nextRunAt: '2026-08-05T12:00:00.000Z' },
])

// C21
@injectable()
export class CreateThreadLoopController extends Controller<
	typeof CreateThreadLoopControllerInputSchema,
	typeof CreateThreadLoopControllerOutputSchema
> {
	/** `orchestration` only — the operator asking out loud, inside the conversation the loop is for. */
	static override readonly mcpScopes = [McpScope.orchestration]
	readonly path = '/threads/:threadId/loops'
	readonly method = 'post' as const
	readonly description = 'Schedule a recurring whisper into this conversation (C21)'
	readonly inputSchema = CreateThreadLoopControllerInputSchema
	readonly outputSchema = CreateThreadLoopControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: CreateThreadLoop) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			prompt: request.body.prompt,
			schedule: request.body.schedule,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}

export const UpdateThreadLoopControllerInputSchema = LoopParam.extend({
	body: UpdateThreadLoopInputSchema.pick({ prompt: true, schedule: true }),
}).example([{ ctx: { ownerId: OWNER }, params: { threadId: THREAD, loopId: LOOP }, body: { prompt: PROMPT, schedule: INTERVAL_SCHEDULE } }])
export const UpdateThreadLoopControllerOutputSchema = UpdateThreadLoopOutputSchema.example([{ nextRunAt: '2026-08-05T12:00:00.000Z' }])

// C22
@injectable()
export class UpdateThreadLoopController extends Controller<
	typeof UpdateThreadLoopControllerInputSchema,
	typeof UpdateThreadLoopControllerOutputSchema
> {
	/** `orchestration` only. Note this is a WHOLE-loop edit, which the prompt has to say out loud: a
	 *  model that sends only the changed half erases the other one. */
	static override readonly mcpScopes = [McpScope.orchestration]
	readonly path = '/threads/:threadId/loops/:loopId'
	readonly method = 'put' as const
	readonly description = 'Edit a loop — its prompt and its schedule (C22)'
	readonly inputSchema = UpdateThreadLoopControllerInputSchema
	readonly outputSchema = UpdateThreadLoopControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: UpdateThreadLoop) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			loopId: request.params.loopId,
			prompt: request.body.prompt,
			schedule: request.body.schedule,
		})
		return { status: HttpStatusCode.OK, data }
	}
}

export const SetThreadLoopEnabledControllerInputSchema = LoopParam.extend({
	body: SetThreadLoopEnabledInputSchema.pick({ enabled: true }),
}).example([{ ctx: { ownerId: OWNER }, params: { threadId: THREAD, loopId: LOOP }, body: { enabled: false } }])
export const SetThreadLoopEnabledControllerOutputSchema = SetThreadLoopEnabledOutputSchema.example([{ nextRunAt: undefined }])

// C23
@injectable()
export class SetThreadLoopEnabledController extends Controller<
	typeof SetThreadLoopEnabledControllerInputSchema,
	typeof SetThreadLoopEnabledControllerOutputSchema
> {
	/** `orchestration` only — and this is the REVERSIBLE half of "para de me mandar isso", which is why
	 *  the prompt sends the model here by default and to the delete door only when asked to remove. */
	static override readonly mcpScopes = [McpScope.orchestration]
	readonly path = '/threads/:threadId/loops/:loopId/enabled'
	readonly method = 'put' as const
	readonly description = 'Pause or resume a loop (C23)'
	readonly inputSchema = SetThreadLoopEnabledControllerInputSchema
	readonly outputSchema = SetThreadLoopEnabledControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: SetThreadLoopEnabled) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			loopId: request.params.loopId,
			enabled: request.body.enabled,
		})
		return { status: HttpStatusCode.OK, data }
	}
}

export const DeleteThreadLoopControllerInputSchema = LoopParam.example([
	{ ctx: { ownerId: OWNER }, params: { threadId: THREAD, loopId: LOOP } },
])
export const DeleteThreadLoopControllerOutputSchema = DeleteThreadLoopOutputSchema

// C24
@injectable()
export class DeleteThreadLoopController extends Controller<
	typeof DeleteThreadLoopControllerInputSchema,
	typeof DeleteThreadLoopControllerOutputSchema
> {
	/** `orchestration` only, and the one door here with no undo — which is a fact about the operation,
	 *  not a reason to withhold it: the operator who says "pode apagar aquele loop" is asking for this
	 *  and nothing else. What keeps a model from reaching it on "para com isso" is the prompt, which
	 *  sends that sentence to the pause door above. */
	static override readonly mcpScopes = [McpScope.orchestration]
	readonly path = '/threads/:threadId/loops/:loopId'
	readonly method = 'delete' as const
	readonly description = 'Remove a loop (C24)'
	readonly inputSchema = DeleteThreadLoopControllerInputSchema
	readonly outputSchema = DeleteThreadLoopControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: DeleteThreadLoop) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({
			ownerId: request.ctx.ownerId,
			threadId: request.params.threadId,
			loopId: request.params.loopId,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
```

### Step T1.4 — Verde

Run: `cd packages/api/typescript && bun test src/thread/controllers/ThreadLoops.test.ts`
Expected: PASS — 6 testes.

Depois rode `bun test src/thread/` inteiro para garantir que nada em `thread` regrediu, e o gate da Task.

### Step T1.5 — Commit

```bash
git add packages/api/typescript/src/thread/controllers/ThreadLoops.ts \
        packages/api/typescript/src/thread/controllers/ThreadLoops.test.ts
git commit -m "feat(thread): os loops de uma conversa são acionáveis de dentro dela (Task T1)"
```

---

## Task T2: O orquestrador sabe QUANDO e COMO agendar um prompt recorrente

**Files to write:**
- Modify: `packages/api/typescript/src/agent/mcp/exposure.ts` — as cinco classes de loop entram no re-export nominal (a lista de classes NOMEADAS POR PROSA), para o prompt nomear as ferramentas por símbolo
- Modify: `packages/api/typescript/src/agent/agents/OrchestratorAgent/types.ts` — `OrchestratorInputSchema` ganha `timezone`
- Modify: `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts` — preenche `timezone` com o fuso da máquina
- Modify: `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.ts` — nova seção `recurringPrompts()`, encaixada em `system()`
- Test: `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.test.ts` — a situação renderiza, os nomes são derivados, o fuso aparece
- Modify: `packages/api/typescript/src/agent/agents/OrchestratorAgent/OrchestratorAgent.test.ts` — a fixture ganha `timezone`

**Files to read:**
- `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.ts` — em especial `issues()`, `redirectingWork()` e `standingInstructions()`
- `packages/api/typescript/src/agent/mcp/exposure.ts` — o bloco de doc do re-export por prosa
- `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts:214-233` — o objeto passado a `agent.run`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /agent, /test
**Depends on:** T1
**Consumes (frozen):** `toolNameOf` de `../../mcp/exposure`, e as cinco classes que T1 tornou exponíveis — `ListThreadLoopsController`, `CreateThreadLoopController`, `UpdateThreadLoopController`, `SetThreadLoopEnabledController`, `DeleteThreadLoopController`, todas exportadas por `@thread/controllers`. `OrchestratorInputSchema` (campos existentes `customPrompt`, `openStops`, `contactKind`, `mentionTag`), `OrchestratorPromptBuilder`.
**Scope fence:** DONE elsewhere — T1 abriu os cinco escopos e escreveu a prova de confinamento; não reabra nem duplique. OUT — regen de SDK e snapshot (T3); qualquer mudança em `IssueWorkPromptBuilder` (esta é uma ferramenta do orquestrador); qualquer mudança no `LoopsSection` do console. **Não** digite o nome de nenhuma ferramenta como literal — o arquivo inteiro deriva nomes por `toolNameOf`, e um literal quebra a regra que ele documenta. **Não** repita no prompt os limites numéricos de `everyMinutes`: `LoopIntervalMinutesSchema` já os emite como `minimum`/`maximum` no schema da ferramenta gerada, e restatá-los aqui criaria uma segunda fonte de verdade que deriva. **Não** importe nada de `@thread/objects` — a licença de context-map deste arquivo cobre `@thread/controllers` e nada mais.
**Gate:** `cd packages/api/typescript && bun test src/agent/agents/OrchestratorAgent/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T2.1 — Re-export nominal

Modifique `packages/api/typescript/src/agent/mcp/exposure.ts`:

1. Na linha de import por nome de `@thread/controllers` (hoje `import { ResolveStopController, ConfigurePromptController } from '@thread/controllers'`), some as cinco classes: `ListThreadLoopsController`, `CreateThreadLoopController`, `UpdateThreadLoopController`, `SetThreadLoopEnabledController`, `DeleteThreadLoopController`. A exceção por arquivo do `shared/context-map.ts` já cobre `exposure.ts → <ctx>/controllers`; **nenhum ajuste de context-map é necessário**.
2. No bloco `export { … }` do fim do arquivo, some as mesmas cinco, precedidas do comentário:

```typescript
	// Named by `recurringPrompts()` — the paragraph that lets the operator put a prompt on a timer
	// without leaving the conversation. Five rather than one because the operator's second sentence is
	// always about a loop that already exists, and the read is what turns an id the model never saw
	// into one it can address. Same context and same license as `ResolveStopController` above.
	ListThreadLoopsController,
	CreateThreadLoopController,
	UpdateThreadLoopController,
	SetThreadLoopEnabledController,
	DeleteThreadLoopController,
```

### Step T2.2 — O fuso da máquina entra na entrada do turno

Modifique `packages/api/typescript/src/agent/agents/OrchestratorAgent/types.ts`: em `OrchestratorInputSchema`, imediatamente **depois** do campo `customPrompt`, adicione:

```typescript
	/**
	 * The IANA zone this install runs in — the one fact a `DAILY` loop needs and the model cannot derive.
	 *
	 * `DailyLoopSchedule` requires a zone, and a model guessing one from the language of the conversation
	 * writes a wrong hour that reads like a right one. The console has never had this problem because it
	 * reads `Intl.DateTimeFormat().resolvedOptions().timeZone` off the browser (`LoopsSection.tsx:99`);
	 * the daemon is the same machine, and this repository already ratified that equivalence when it
	 * dropped the timezone from Settings because "the timezone is the machine's".
	 *
	 * REQUIRED, not optional-with-a-default — the same rule `openStops` above states. The turn always
	 * knows the answer, so "absent" would mean nothing except that somebody forgot to wire it, and a
	 * defaulted zone is the failure mode this field exists to prevent rather than a fallback for it.
	 */
	timezone: z.string().min(1),
```

Modifique `packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts`: no objeto passado a `this.agent.run(runner, {...})`, logo **depois** da linha `customPrompt: thread.customPrompt,`, adicione:

```typescript
			// The machine's zone, read here rather than stored anywhere: CODM runs on the operator's own
			// machine, which is the same equivalence the console relies on for the very same field.
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
```

### Step T2.3 — Escrever os testes que falham

Em `prompt.test.ts`, some `timezone: 'America/Sao_Paulo'` ao objeto `base` (junto de `openStops: []`), e adicione os casos abaixo logo depois do bloco `(h4)` que cobre as instruções permanentes. Some também os cinco símbolos ao `import { … } from '../../mcp/exposure'` do topo do arquivo.

```typescript
	/**
	 * AC-10 — the recurring-prompt situation renders, naming all five tools by their classes.
	 *
	 * FIVE and not one: the operator's first sentence creates a loop and every sentence after it is
	 * about one that already exists, so a paragraph that named only the create door would leave a model
	 * able to set alarms and unable to turn them off. Asserted through `toolNameOf` rather than spelled
	 * out so a rename follows the symbol — swap any of them for a literal and this goes red.
	 */
	it('(h5) AC-10 — the recurring-prompt situation renders, naming all five loop tools by class', () => {
		const system = builder.system(operatorTurn())

		expect(system).toContain('RECURRING PROMPTS IN THIS CONVERSATION')
		for (const controller of [
			ListThreadLoopsController,
			CreateThreadLoopController,
			UpdateThreadLoopController,
			SetThreadLoopEnabledController,
			DeleteThreadLoopController,
		]) {
			expect(system).toContain(toolNameOf(controller))
		}
	})

	/**
	 * AC-11 — the two halves a model gets wrong on its own.
	 *
	 * The schedule is a DISCRIMINATED union, so "one of two shapes, never a mixture" is the contract
	 * restated in prose the model reads before it composes a body — a flattened attempt is a validation
	 * error the operator experiences as a failed request. And it holds NO loop id: the identity carries
	 * none and no section prints one, so "list first" is not advice, it is the only path from "aquele do
	 * deploy" to an addressable row.
	 */
	it('(h6) AC-11 — it presents the two schedule shapes as exclusive and sends the model to list first', () => {
		const system = builder.system(operatorTurn())

		expect(system).toContain('ONE of two shapes')
		expect(system).toContain(`call ${toolNameOf(ListThreadLoopsController)} first`)
	})

	/**
	 * AC-12 — pausing and deleting are different answers to the same sentence, and only one is
	 * reversible. A model that reads "não me manda mais isso" and deletes has destroyed a configuration
	 * the operator believed was merely off.
	 */
	it('(h7) AC-12 — it makes pausing the default for "stop" and marks deleting as the one with no undo', () => {
		const system = builder.system(operatorTurn())

		expect(system).toContain(`PAUSE it with ${toolNameOf(SetThreadLoopEnabledController)}`)
		expect(system).toContain('no undo')
	})

	/**
	 * AC-13 — the zone travels and is RENDERED, because a zone the model cannot see is a zone it
	 * invents. It is printed as the value to send, not as trivia about the host.
	 */
	it('(h8) AC-13 — the machine timezone reaches the prompt as the value to send', () => {
		const system = builder.system(operatorTurn({ timezone: 'Europe/Lisbon' }))

		expect(system).toContain('Europe/Lisbon')
	})

	/**
	 * AC-14 — the two rules that keep a schedule from being an autonomy. "Never infer" is `issues()`'s
	 * rule and it is restated here because the cost is higher: a standing instruction inferred wrongly
	 * is a sentence, a schedule inferred wrongly is a conversation that interrupts itself until somebody
	 * notices.
	 */
	it('(h9) AC-14 — it repeats never-infer and never-claim-what-you-did-not-call', () => {
		const system = builder.system(operatorTurn())

		expect(system).toContain('never turn a passing remark into a schedule')
		expect(system).toContain('do not say you did')
	})
```

Em `OrchestratorAgent.test.ts`, some `timezone: 'America/Sao_Paulo'` à fixture que hoje carrega `openStops: []` (linha ~43), para o input continuar satisfazendo o schema.

Run: `cd packages/api/typescript && bun test src/agent/agents/OrchestratorAgent/`
Expected: FAIL — os cinco casos novos falham por a seção não existir.

### Step T2.4 — Escrever a seção

Em `prompt.ts`:

1. Some os cinco símbolos ao `import { … } from '../../mcp/exposure'` do topo.
2. Em `system()`, chame `...this.recurringPrompts(input),` **depois** de `...this.standingInstructions(input),` e **antes** de `...this.stops(input),`.
3. Adicione o método privado abaixo, logo depois de `standingInstructions`:

```typescript
	/**
	 * PROMPTS RECORRENTES — o operador falando no timer, de dentro da conversa em que o timer vai bater.
	 *
	 * `standingInstructions()` acima é o irmão desta seção e a diferença entre as duas é o custo do erro.
	 * Uma instrução permanente escrita por engano é uma frase que o operador reescreve; um loop criado
	 * por engano é uma conversa que passa a se interromper sozinha, a cada quinze minutos, até alguém
	 * abrir o console e notar. Por isso a regra de nunca inferir aparece aqui com o motivo colado nela em
	 * vez de por referência: uma regra geral longe do caso que a motiva é uma frase que o modelo lê e não
	 * aplica.
	 *
	 * ### Por que CINCO ferramentas e não uma
	 * A primeira frase do operador cria um loop. Todas as seguintes são sobre um que já existe — "muda
	 * para as 8", "para com isso uns dias", "pode apagar". Expor só a criação produziria um agente capaz
	 * de armar alarmes e incapaz de desarmá-los, e o operador voltaria ao console exatamente para a parte
	 * chata. A LEITURA é o que torna as outras alcançáveis: a identidade do run carrega `threadId` e nada
	 * com forma de loop, e nenhuma seção deste prompt imprime a lista, então sem ela "aquele do deploy" é
	 * uma frase que o modelo não tem como transformar numa linha endereçável.
	 *
	 * ### Por que os limites de `everyMinutes` NÃO estão escritos aqui
	 * `LoopIntervalMinutesSchema` já carrega `.min()`/`.max()`, e eles são emitidos como `minimum` e
	 * `maximum` no schema JSON da ferramenta gerada — o modelo os lê na própria definição da tool. Repetir
	 * os números nesta prosa criaria uma segunda fonte de verdade que só sabe derivar, e a primeira delas
	 * mora em outro contexto, que este arquivo não tem licença para importar.
	 *
	 * ### Por que o fuso é IMPRESSO
	 * O membro por relógio exige uma zona IANA e o modelo não tem de onde tirar uma: adivinhar pelo
	 * idioma da conversa é escrever um horário errado com cara de certo. `input.timezone` é o fuso da
	 * máquina, que é o mesmo que o console lê do browser para preencher o mesmo campo.
	 */
	private recurringPrompts(input: OrchestratorInput): string[] {
		const listLoops = toolNameOf(ListThreadLoopsController)
		const createLoop = toolNameOf(CreateThreadLoopController)
		const updateLoop = toolNameOf(UpdateThreadLoopController)
		const pauseLoop = toolNameOf(SetThreadLoopEnabledController)
		const deleteLoop = toolNameOf(DeleteThreadLoopController)
		return [
			'',
			'RECURRING PROMPTS IN THIS CONVERSATION',
			'The operator can put a prompt on a timer here: a message this conversation whispers to itself on a ' +
				`schedule, which you then answer as an ordinary turn. ${createLoop} is how you schedule one, and it ` +
				'belongs to THIS conversation and no other.',
			'Only when they ask for it out loud. You never infer one, and you never turn a passing remark into a ' +
				'schedule. Getting a standing instruction wrong costs a sentence; getting a schedule wrong costs a ' +
				'conversation that interrupts itself until somebody notices.',
			'A schedule is ONE of two shapes, and never a mixture of the two:',
			`  - by the clock — a time of day, the weekdays it runs on, and the timezone, which is ${input.timezone} ` +
				'unless the operator names another;',
			'  - by cadence — every N minutes, a whole number within the bounds the tool declares. The first run is ' +
				'N minutes from now, never immediately.',
			`You hold no loop ids. To change, pause or remove something already scheduled, call ${listLoops} first, ` +
				'find the one the operator means by its text, and use the id it hands you.',
			`${updateLoop} replaces BOTH the prompt and the schedule of one loop, so send the whole of both — the ` +
				'half you leave out is the half you erase.',
			`When the operator just wants it to stop, PAUSE it with ${pauseLoop}; it keeps its place and the same ` +
				`call brings it back. ${deleteLoop} is for when they ask you to remove it, and there is no undo.`,
			'Say what you scheduled in one line, in your own voice, and never put a loop id in a reply. And if you ' +
				'did not call the tool, do not say you did.',
		]
	}
```

### Step T2.5 — Verde

Run: `cd packages/api/typescript && bun test src/agent/agents/OrchestratorAgent/`
Expected: PASS.

Depois rode `bun test src/agent/` inteiro (o campo novo é obrigatório, então qualquer outro construtor de input do orquestrador aparece aqui) e o gate da Task.

### Step T2.6 — Commit

```bash
git add packages/api/typescript/src/agent/mcp/exposure.ts \
        packages/api/typescript/src/agent/agents/OrchestratorAgent/types.ts \
        packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.ts \
        packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.test.ts \
        packages/api/typescript/src/agent/agents/OrchestratorAgent/OrchestratorAgent.test.ts \
        packages/api/typescript/src/agent/usecases/RunOrchestratorTurn.ts
git commit -m "feat(agent): o orquestrador sabe quando e como agendar um prompt recorrente (Task T2)"
```

---

## Task T3: Contract Lock — o artefato publicado e os rails concordam

**Files to write:**
- Regenerate: `packages/api/typescript/public/docs/openapi.json` (via `bun emit-openapi`)
- Regenerate: `packages/client/dist/**` (via `bun sdk`) — inclui o servidor MCP do escopo `orchestration`
- Modify: `packages/api/typescript/tests/architecture/__snapshots__/mcp-exposure.test.ts.snap` — o snapshot dourado ganha as cinco ferramentas em `orchestration`
- Modify: `packages/api/typescript/tests/architecture/mcp-exposure.test.ts` — asserções nomeadas da mudança de exposição desta frente (molde do `AC-1 — ConfigurePrompt`)

**Files to read:**
- `packages/api/typescript/tests/architecture/mcp-exposure.test.ts`
- `packages/api/typescript/src/agent/mcp/generated-server.test.ts` — já é paramétrico sobre `McpScope`; não precisa de edição

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /sdk
**Depends on:** T1, T2
**Consumes (frozen):** `mcpExposure`, `operationIdsInScope`, `toolsInScope` de `@agent/mcp/exposure`; `McpScope` de `@codm/contracts-typescript/wire/enums`; os operationIds já emitidos e estáveis `ListThreadLoops`, `CreateThreadLoop`, `UpdateThreadLoop`, `SetThreadLoopEnabled`, `DeleteThreadLoop`.
**Scope fence:** OUT — qualquer edição manual em arquivo gerado. Se o `bun sdk` não propagar (o Kubb é incremental), force a regen limpa; **nunca** edite `dist/` na mão. Os `.mcp.json` gerados sob `packages/client/dist/typescript/src/typescript/mcp/scopes/*/` embutem um caminho absoluto da máquina — se a regen os reescrever para o caminho do worktree, reverta-os (`git checkout --`) antes de commitar.
**Gate:** `bun sdk && cd packages/api/typescript && bun test tests/architecture/mcp-exposure.test.ts src/agent/mcp/ && cd ../../.. && bun tsc && bun lint && bun run test`

### Step T3.1 — Regenerar

```bash
bun x nx reset
bun emit-openapi
bun sdk
```

Confira no diff que `openapi.json` ganhou a tag `mcp:orchestration` e o `x-mcp-scope` com `orchestration` nas cinco operações, que `ListThreadLoops` manteve `system` nos dois lugares, e que **nenhuma** das quatro escritas ganhou `system`.

```bash
git diff --stat packages/client/dist/ packages/api/typescript/public/docs/openapi.json
```

Expected: `openapi.json` mudou; arquivos sob `packages/client/dist/` mudaram (as ferramentas novas no servidor MCP do escopo `orchestration`).

### Step T3.2 — Fechar os rails

Atualize o snapshot e **leia o diff** — ele é a revisão da mudança de superfície:

```bash
cd packages/api/typescript && bun test tests/architecture/mcp-exposure.test.ts --update-snapshots
```

Espere exatamente cinco entradas novas em `orchestration` (`mcp__codm__CreateThreadLoop`, `mcp__codm__DeleteThreadLoop`, `mcp__codm__ListThreadLoops`, `mcp__codm__SetThreadLoopEnabled`, `mcp__codm__UpdateThreadLoop`), **nenhuma** entrada nova em `system` e nenhuma removida de lá.

Adicione as duas asserções nomeadas ao `describe('the scan and the emitted spec describe the same surface, in both directions', …)`, logo depois do teste `AC-1 — ConfigurePrompt …`:

```typescript
	/**
	 * AC-1 — the exposure change of the loops frente, named rather than left to the snapshot.
	 *
	 * The four writes carry `orchestration` ALONE and the read carries both, and each half is
	 * load-bearing. Losing `orchestration` on any write puts the operator back in the console to change
	 * a schedule they are talking about; losing it on the READ is worse and quieter, because the four
	 * writes stay listed while becoming unaddressable — the identity carries no loop id and no prompt
	 * section prints one, so the read is the only path from "aquele do deploy" to a row.
	 */
	test('AC-1 — the five loop tools are in orchestration, and the read is in system too', () => {
		for (const operationId of ['CreateThreadLoop', 'UpdateThreadLoop', 'SetThreadLoopEnabled', 'DeleteThreadLoop']) {
			expect(sorted(mcpExposure().scopesFor(operationId))).toEqual([McpScope.orchestration])
		}
		expect(sorted(mcpExposure().scopesFor('ListThreadLoops'))).toEqual([McpScope.system, McpScope.orchestration].sort())
	})

	/**
	 * AC-2 — and what did NOT change, asserted rather than assumed.
	 *
	 * `system` is the external MCP client, which carries no run token and therefore has no conversation
	 * to be confined to; that is why this file's READ-only posture for loops predates this frente and
	 * survives it. A write drifting into `system` would hand an unconfined caller a scheduler, which is
	 * a decision somebody should have to make on purpose — this line is what makes them.
	 */
	test('AC-2 — the loop WRITES stay off the `system` surface, which stays read-only for loops', () => {
		const inSystem = new Set(operationIdsInScope(McpScope.system))
		for (const operationId of ['CreateThreadLoop', 'UpdateThreadLoop', 'SetThreadLoopEnabled', 'DeleteThreadLoop']) {
			expect(inSystem.has(operationId)).toBe(false)
		}
		expect(inSystem.has('ListThreadLoops')).toBe(true)
	})
```

AC-3 e AC-15 não precisam de teste novo: `generated-server.test.ts` itera sobre `Object.values(McpScope)` e compara com o `x-mcp-scopes` publicado, e `IssueWorkAgent.test.ts` já assevera que nenhuma ferramenta de `system` alcança o agente de trabalho — as duas passam a cobrir estas ferramentas sozinhas. Confirme que passam.

### Step T3.3 — Gate completo

```bash
bun tsc && bun lint && bun run test
```

Expected: 0 erros.

### Step T3.4 — Commit

```bash
git add packages/api/typescript/public/docs/openapi.json \
        packages/client/dist/ \
        packages/api/typescript/tests/architecture/mcp-exposure.test.ts \
        packages/api/typescript/tests/architecture/__snapshots__/mcp-exposure.test.ts.snap
git commit -m "chore(sdk): regenerate openapi+sdk para os loops no escopo orchestration (Task T3)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun run test` — todos os testes (exceto e2e) passam
- [ ] AC mapping (cada AC da spec → ≥1 teste):
  - AC-1 → `packages/api/typescript/tests/architecture/mcp-exposure.test.ts:"AC-1 — the five loop tools are in orchestration, and the read is in system too"` (+ o snapshot dourado)
  - AC-2 → `packages/api/typescript/tests/architecture/mcp-exposure.test.ts:"AC-2 — the loop WRITES stay off the \`system\` surface, which stays read-only for loops"`
  - AC-3 → `packages/api/typescript/src/agent/mcp/generated-server.test.ts` (paramétrico sobre `McpScope`, cobre as cinco sem edição)
  - AC-4 → `packages/api/typescript/src/thread/controllers/ThreadLoops.test.ts:"AC-4 — an ORCHESTRATION run schedules a DAILY loop and an INTERVAL loop, each with its own shape"`
  - AC-5 → `packages/api/typescript/src/thread/controllers/ThreadLoops.test.ts:"AC-5 — the same run reads, edits, pauses, resumes and removes a loop of its own conversation"`
  - AC-6 → `packages/api/typescript/src/thread/controllers/ThreadLoops.test.ts:"AC-6 — a run of ANOTHER conversation cannot touch this one's loops, and they survive"`
  - AC-7 → `packages/api/typescript/src/thread/controllers/ThreadLoops.test.ts:"AC-7 — a real loop id belonging to ANOTHER conversation is refused by the use case, and survives"`
  - AC-8 → `packages/api/typescript/src/thread/controllers/ThreadLoops.test.ts:"AC-8 — a REVOKED run token is refused and no loop is created"`
  - AC-9 → `packages/api/typescript/src/thread/controllers/ThreadLoops.test.ts:"AC-9 — the CONSOLE path is untouched: no run token, the loop is still scheduled"`
  - AC-10 → `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.test.ts:"(h5) AC-10 — the recurring-prompt situation renders, naming all five loop tools by class"`
  - AC-11 → `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.test.ts:"(h6) AC-11 — it presents the two schedule shapes as exclusive and sends the model to list first"`
  - AC-12 → `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.test.ts:"(h7) AC-12 — it makes pausing the default for \"stop\" and marks deleting as the one with no undo"`
  - AC-13 → `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.test.ts:"(h8) AC-13 — the machine timezone reaches the prompt as the value to send"`
  - AC-14 → `packages/api/typescript/src/agent/agents/OrchestratorAgent/prompt.test.ts:"(h9) AC-14 — it repeats never-infer and never-claim-what-you-did-not-call"`
  - AC-15 → `packages/api/typescript/src/agent/agents/IssueWorkAgent/IssueWorkAgent.test.ts:"carries NO operation of the \`system\` scope"` (as cinco ficam fora de `issue-handling`, e a quinta fica fora do agente por não estar em `issue-handling`)

## Notes

- **Não há E2E nesta frente.** Nenhuma superfície de browser muda (Decisão 11), e o que há para provar — que a ferramenta é chamável, confinada e nomeada no prompt — é provado nos níveis onde vive. Adicionar um spec Playwright aqui testaria o console, que esta frente não toca.
- **`bun sdk` é incremental (Kubb).** Se a regen não propagar para todos os arquivos gerados, force a regen limpa antes de commitar; nunca edite `dist/` na mão.
- **Rodando de um worktree:** `bun x nx reset` antes da regen (o Nx replica cache entre worktrees e já reverteu um `openapi.json` regenerado), e confira se algum `.mcp.json` sob `packages/client/dist/typescript/src/typescript/mcp/scopes/*/` foi reescrito com o caminho absoluto do worktree — reverta-os antes do commit.
- **Nenhuma migração, nenhum evento, nenhuma mudança de contrato TypeSpec.** `LoopScheduleKind` e `DayOfWeek` já existem e já são gerados; `bun contracts` não precisa rodar.
