import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import { Handler, z, BaseError, DrizzleClient } from '@codm/core-typescript'
import { threads } from '@codm/contracts/db'
import { DayOfWeek } from '@codm/contracts-typescript/wire/enums'
import { LoopRepository } from '../repositories/LoopRepository'
import { LOOP_PROMPT_MAX_LENGTH } from '../schemas'
import type { ApplicationErrors } from '../errors'

export const ListThreadLoopsInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid() })

export const ListThreadLoopsOutputSchema = z.object({
	loops: z.array(
		z.object({
			loopId: z.uuid(),
			prompt: z.string(),
			timeOfDay: z.string(),
			weekdays: z.array(z.enum(DayOfWeek)),
			timezone: z.string(),
			enabled: z.boolean(),
			/** ISO — absent iff the loop is paused. The console renders "próxima: …" from it. */
			nextRunAt: z.string().optional(),
			/** ISO — absent until it has fired once. */
			lastFiredAt: z.string().optional(),
		}),
	),
	/**
	 * The cap the textarea counts down to — the SAME number `CreateThreadLoop` validates against.
	 *
	 * It travels in the DTO for the reason the custom prompt's does: a counter that disagrees with the
	 * validator is worse than no counter, and the wire is the one place both sides can read it from.
	 */
	promptMaxLength: z.number().int().positive(),
})

/**
 * Read — the loops of one conversation (T11). What the settings dialog's "Loops" section renders.
 *
 * Reads through the REPOSITORY rather than joining tables itself, unlike its sibling
 * `GetThreadSettings`: there is no cross-aggregate shape to assemble here — the list IS the loops —
 * and the repository already owns the ordering the section wants (next run first). The one direct
 * table read is the thread's existence, which is a guard, not a projection.
 */
@injectable()
export class ListThreadLoops extends Handler<typeof ListThreadLoopsInputSchema, typeof ListThreadLoopsOutputSchema> {
	readonly name = 'list_thread_loops' as const
	readonly inputSchema = ListThreadLoopsInputSchema
	readonly outputSchema = ListThreadLoopsOutputSchema

	constructor(
		private readonly db: DrizzleClient,
		private readonly loops: LoopRepository,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		// Filtered on `deletedAt` like every other per-thread read (thread-deletion spec, decision 5):
		// the loops of a conversation that no longer exists must not keep rendering.
		const [thread] = await this.db
			.select({ ownerId: threads.ownerId })
			.from(threads)
			.where(and(eq(threads.id, input.threadId), isNull(threads.deletedAt)))
			.limit(1)
		if (!thread || thread.ownerId !== input.ownerId)
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		const loops = await this.loops.listByThread(input.threadId)

		return {
			loops: loops.map(loop => ({
				loopId: loop.id.value,
				prompt: loop.prompt,
				timeOfDay: loop.schedule.timeOfDay,
				weekdays: loop.schedule.weekdays,
				timezone: loop.schedule.timezone,
				enabled: loop.enabled,
				nextRunAt: loop.nextRunAt?.toISOString(),
				lastFiredAt: loop.lastFiredAt?.toISOString(),
			})),
			promptMaxLength: LOOP_PROMPT_MAX_LENGTH,
		}
	}
}
