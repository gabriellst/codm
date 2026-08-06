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
 * `system` DOES NOT CHANGE — the read stays, the writes stay out. That asymmetry is not an oversight
 * being corrected here: it is the deliberate posture this file already carried ("READ only — the
 * writes below stay off the door"), and it stays true because `system` is the EXTERNAL MCP client,
 * which carries no run token and therefore has no conversation to be confined to. `orchestration`
 * does. Widening `system` is a second exposure decision, recorded as a follow-up in the spec rather
 * than smuggled in with this one.
 *
 * `issue-handling` IS OUT. The agent that executes an issue reads third-party text as its input, and
 * programming recurring whispers into a conversation is not issue work. `IssueWorkAgent.test.ts` still
 * pins that no `system` tool reaches it, and that assertion is untouched by these lines.
 *
 * ### NO OWNERSHIP GUARD IN ANY `handle()`, DELIBERATELY — THE FENCE IS TWO PIECES THAT EXIST
 *  1. THE CONVERSATION. Every path starts at `/threads/:threadId/loops`; an `orchestration` identity
 *     carries `threadId` (`OrchestratorAgent.IdentitySchema` omits only `issueId`); and
 *     `AgentIdentityMiddleware` — appended by `Controller.effectiveMiddlewares` precisely BECAUSE
 *     these classes declare `mcpScopes` — compares the keys the identity carries against
 *     `{...params, ...body}`. Another conversation's loops are a 403 before `handle()` is entered.
 *  2. THE LOOP. The three per-loop doors carry a `loopId` the identity does NOT carry, so
 *     `compareIdentity` has nothing to say about it — and does not need to: `loadLoop()` in
 *     `ManageThreadLoops` already refuses a loop whose `ownerId`/`threadId` are not the caller's, a
 *     guard written for the console for the identical reason (loop ids are addressable from there
 *     too). Adding a second check here would hide the fact that the existing one is doing the work.
 *
 * `ThreadLoops.test.ts` measures both halves by reading the victim's loops back, not merely the error
 * — and pins the declaration itself, since the declaration is what MOUNTS the first half.
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
 * only one, which is precisely the misreading a discriminated contract exists to prevent.
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
	/** BOTH surfaces. `system` is what it already had: an agent asked "o que está agendado nesta
	 *  conversa?" should be able to answer without the operator opening the dialog. `orchestration` is
	 *  new, and it is the ONLY way the resident agent learns a loop id — without it the four writes
	 *  below are addressable by nobody. See the exposure block at the top of the file. */
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
	/** `orchestration` only. Note this is a WHOLE-loop edit, which the orchestrator prompt has to say
	 *  out loud: a model that sends only the half it is changing erases the other one. */
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
