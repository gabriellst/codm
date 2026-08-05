import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import { Handler, z, BaseError, DrizzleClient } from '@codm/core-typescript'
import { threads } from '@codm/contracts/db'
import { LoopRepository } from '../repositories/LoopRepository'
import { LoopScheduleInputSchema, LOOP_MIN_INTERVAL_MINUTES, LOOP_MAX_INTERVAL_MINUTES } from '../objects/LoopSchedule'
import { LOOP_PROMPT_MAX_LENGTH } from '../schemas'
import type { ApplicationErrors } from '../errors'

export const ListThreadLoopsInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid() })

export const ListThreadLoopsOutputSchema = z.object({
	loops: z.array(
		z.object({
			loopId: z.uuid(),
			prompt: z.string(),
			/**
			 * The SAME union the write doors accept, not a flattened echo of it.
			 *
			 * Which means the console can hand `loop.schedule` straight back as the edit form's default
			 * values — the read and the write speak one shape, so there is no mapping layer to get wrong,
			 * and a loop whose schedule has no time of day simply does not carry the field.
			 */
			schedule: LoopScheduleInputSchema,
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
	/** The cadence field's bounds, for the same reason and from the same source as the cap above. */
	minIntervalMinutes: z.number().int().positive(),
	maxIntervalMinutes: z.number().int().positive(),
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
				// The value object IS the wire member — it carries `kind` and exactly that member's fields,
				// so there is nothing to map and no branch to write here.
				schedule: loop.schedule,
				enabled: loop.enabled,
				nextRunAt: loop.nextRunAt?.toISOString(),
				lastFiredAt: loop.lastFiredAt?.toISOString(),
			})),
			promptMaxLength: LOOP_PROMPT_MAX_LENGTH,
			minIntervalMinutes: LOOP_MIN_INTERVAL_MINUTES,
			maxIntervalMinutes: LOOP_MAX_INTERVAL_MINUTES,
		}
	}
}
