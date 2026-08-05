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
	/** Reachable as an MCP tool: an agent asked "o que está agendado nesta conversa?" should be able to
	 *  answer without the operator opening the dialog. READ only — the writes below stay off the door. */
	static override readonly mcpScopes = [McpScope.system]
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
