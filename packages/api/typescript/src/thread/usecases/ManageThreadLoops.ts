import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { Loop } from '../entities/Loop'
import { LoopScheduleInputSchema } from '../objects/LoopSchedule'
import { LoopRepository } from '../repositories/LoopRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { LoopPromptSchema } from '../schemas'
import type { ApplicationErrors } from '../errors'

/**
 * The four writes of a thread LOOP — create it, edit it, pause it, remove it.
 *
 * One file, like `ConfigureThreadSettings` next door and for the same reason: they are four spellings
 * of one operator intention ("this conversation's standing prompts"), they share their guard, and
 * splitting them would cost four near-identical headers to say the same three lines.
 *
 * THE GUARD IS THE SAME EVERY TIME and it is two questions, not one: the thread must be this owner's,
 * and the loop must be that thread's. Loop ids are addressable from the console, so "delete loop X"
 * with a stolen id must not delete somebody's loop just because the id is real — hence the ownership
 * check runs against the LOOP's own `ownerId` and `threadId`, never against the URL alone.
 */

/** The (ownerId, threadId, loopId) → `Loop` lookup every write below starts from. */
async function loadLoop(loops: LoopRepository, input: { ownerId: string; threadId: string; loopId: string }): Promise<Loop> {
	const loop = await loops.findById(input.loopId)
	if (!loop || loop.ownerId !== input.ownerId || loop.threadId !== input.threadId)
		throw new BaseError<ApplicationErrors>('LOOP_NOT_FOUND', `no loop ${input.loopId} in thread ${input.threadId}`)
	return loop
}

export const CreateThreadLoopInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	prompt: LoopPromptSchema,
	schedule: LoopScheduleInputSchema,
})
export const CreateThreadLoopOutputSchema = z.object({ loopId: z.uuid(), nextRunAt: z.string() })

/**
 * C21 CreateThreadLoop — schedule a recurring whisper into this conversation.
 *
 * The thread has to EXIST (and be this owner's, and not deleted) before a loop can point at it: an
 * alarm for a conversation nobody can open is an alarm nobody can turn off. It does NOT have to be
 * unpaused — an operator may well set tomorrow's prompts up on a conversation they paused today, and
 * `FireDueLoops` is where the pause is honoured, once, at the moment of firing.
 */
@injectable()
export class CreateThreadLoop extends Handler<typeof CreateThreadLoopInputSchema, typeof CreateThreadLoopOutputSchema> {
	readonly name = 'create_thread_loop' as const
	readonly inputSchema = CreateThreadLoopInputSchema
	readonly outputSchema = CreateThreadLoopOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly loops: LoopRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.ownerId !== input.ownerId || thread.deletedAt)
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		const loop = Loop.create({
			ownerId: input.ownerId,
			threadId: input.threadId,
			prompt: input.prompt,
			schedule: input.schedule,
			now: new Date(),
		})

		await this.withTransaction(tx, async tx => this.loops.save(loop, tx))

		// `nextRunAt` is present by construction — a loop is born enabled, and an enabled loop is armed.
		return { loopId: loop.id.value, nextRunAt: loop.nextRunAt!.toISOString() }
	}
}

export const UpdateThreadLoopInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	loopId: z.uuid(),
	prompt: LoopPromptSchema,
	schedule: LoopScheduleInputSchema,
})
export const UpdateThreadLoopOutputSchema = z.object({ nextRunAt: z.string().optional() })

/**
 * C22 UpdateThreadLoop — edit what is whispered and when.
 *
 * Both fields travel on every save (this is a PUT-shaped edit, not a PATCH): the console renders one
 * form with both, and "the operator submitted the form" is one intention. Partial-update semantics
 * would buy nothing and would make "cleared the weekday pills" indistinguishable from "did not touch
 * the schedule" — the exact ambiguity that lets an unfireable loop through.
 */
@injectable()
export class UpdateThreadLoop extends Handler<typeof UpdateThreadLoopInputSchema, typeof UpdateThreadLoopOutputSchema> {
	readonly name = 'update_thread_loop' as const
	readonly inputSchema = UpdateThreadLoopInputSchema
	readonly outputSchema = UpdateThreadLoopOutputSchema

	constructor(private readonly loops: LoopRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const loop = await loadLoop(this.loops, input)
		loop.reschedule({ prompt: input.prompt, schedule: input.schedule, now: new Date() })
		await this.withTransaction(tx, async tx => this.loops.save(loop, tx))
		return { nextRunAt: loop.nextRunAt?.toISOString() }
	}
}

export const SetThreadLoopEnabledInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	loopId: z.uuid(),
	enabled: z.boolean(),
})
export const SetThreadLoopEnabledOutputSchema = z.object({ nextRunAt: z.string().optional() })

/**
 * C23 SetThreadLoopEnabled — pause or resume one loop.
 *
 * Its own operation and not a field of the edit above, because it is the ONE-CLICK intention: the
 * console renders a switch per row, and routing that switch through the full form's payload would
 * make "pause this" require a prompt and a schedule the operator did not retype.
 */
@injectable()
export class SetThreadLoopEnabled extends Handler<typeof SetThreadLoopEnabledInputSchema, typeof SetThreadLoopEnabledOutputSchema> {
	readonly name = 'set_thread_loop_enabled' as const
	readonly inputSchema = SetThreadLoopEnabledInputSchema
	readonly outputSchema = SetThreadLoopEnabledOutputSchema

	constructor(private readonly loops: LoopRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const loop = await loadLoop(this.loops, input)
		loop.setEnabled(input.enabled, new Date())
		await this.withTransaction(tx, async tx => this.loops.save(loop, tx))
		return { nextRunAt: loop.nextRunAt?.toISOString() }
	}
}

export const DeleteThreadLoopInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid(), loopId: z.uuid() })
export const DeleteThreadLoopOutputSchema = z.void()

/**
 * C24 DeleteThreadLoop — the loop is gone.
 *
 * A HARD delete, unlike the conversation's own (thread-deletion spec, decision 1). The reason the
 * thread keeps its row is that its transcript, issues and artifacts hang off it and are the audit
 * trail; a loop owns nothing — what it produced are whisper lines in a transcript that outlives it,
 * already attributed and already timestamped. Keeping a tombstone would only give the due-sweep one
 * more thing to filter out.
 */
@injectable()
export class DeleteThreadLoop extends Handler<typeof DeleteThreadLoopInputSchema, typeof DeleteThreadLoopOutputSchema> {
	readonly name = 'delete_thread_loop' as const
	readonly inputSchema = DeleteThreadLoopInputSchema
	readonly outputSchema = DeleteThreadLoopOutputSchema

	constructor(private readonly loops: LoopRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const loop = await loadLoop(this.loops, input)
		await this.withTransaction(tx, async tx => this.loops.delete(loop.id.value, tx))
	}
}
