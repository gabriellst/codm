import { AggregateRoot, z } from '@codm/core-typescript'
import type Z from 'zod'
import { LoopScheduleFieldSchema, loopScheduleOf, type LoopScheduleInput } from '../objects/LoopSchedule'
import { LoopPromptSchema } from '../schemas'

export const LoopSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	prompt: LoopPromptSchema,
	schedule: LoopScheduleFieldSchema,
	enabled: z.boolean(),
	/**
	 * When this loop fires next — ABSENT iff it is disabled, and derived from `schedule` in every other
	 * state. Nothing outside this class ever assigns it: `create`, `reschedule`, `setEnabled` and
	 * `markFired` are the four transitions that can move a loop's next run, and each recomputes it.
	 */
	nextRunAt: z.date().optional(),
	/** The last time it actually whispered. Absent until the first fire. */
	lastFiredAt: z.date().optional(),
})

export type LoopProps = Z.infer<typeof LoopSchema>

/**
 * `Loop` — a recurring prompt the operator schedules into ONE conversation.
 *
 * The product's threads answer when spoken to. A loop is the operator speaking on a timer: "toda
 * segunda às 9h, pergunte ao time como está o deploy", or "a cada 15 minutos, veja se o build quebrou".
 * WHICH of those two a loop is lives entirely in its `schedule` — this class asks it "when is the next
 * run?" and never learns the answer's shape. What a loop delivers is a WHISPER — the same
 * agents-only line `SteerThread` writes, never a message on the channel — so a loop can never surprise
 * the contact with a message the operator did not read first.
 *
 * ### Why an aggregate of its own, and not a child of `Thread`
 * It has its own identity (the operator edits, pauses and deletes ONE of several), its own lifecycle,
 * and — decisively — its own QUERY: the sweep asks "which loops, across every conversation, are due?"
 * once a minute. As a child of `Thread` that question could only be answered by hydrating every thread
 * in the database, transcript and all, every tick.
 *
 * ### The clock is always a parameter
 * Every transition takes `now`. The aggregate never reads `Date.now()`, so a week's worth of recurrence
 * is assertable in a unit test with a fixed instant — see `LoopSchedule`, which holds the same rule for
 * the same reason.
 */
export class Loop extends AggregateRoot<typeof LoopSchema> {
	static override schema = LoopSchema

	/** A loop is born ENABLED and already armed — scheduling something and having to switch it on
	 *  afterwards is a second step nobody wants. */
	static create(data: { ownerId: string; threadId: string; prompt: string; schedule: LoopScheduleInput; now: Date }): Loop {
		// The VO is built HERE, from the primitives the use case carries: an invalid time, an empty
		// weekday set or a cadence outside the allowed range must be refused before anything is armed,
		// and `nextRunAfter` below needs the constructed schedule to answer at all.
		const schedule = loopScheduleOf(data.schedule)
		return new Loop({
			ownerId: data.ownerId,
			threadId: data.threadId,
			prompt: data.prompt,
			schedule,
			enabled: true,
			nextRunAt: schedule.nextRunAfter(data.now),
		})
	}

	/**
	 * Edit what is whispered and/or when — the console's "save" on an existing loop.
	 *
	 * The next run is RE-DERIVED from the new schedule, never carried over: moving a loop from 18:00 to
	 * 09:00 must move tonight's run, not take effect only after the pending one has fired. The same
	 * holds across SHAPES — a loop switched from "toda segunda às 09:00" to "a cada 30 minutos" is next
	 * due half an hour from now, not on Monday. A disabled loop stays disabled and stays unarmed —
	 * editing is not a way to switch something on by accident.
	 */
	reschedule(data: { prompt?: string; schedule?: LoopScheduleInput; now: Date }): void {
		if (data.prompt !== undefined) this.prompt = data.prompt
		if (data.schedule !== undefined) this.schedule = loopScheduleOf(data.schedule)
		if (this.enabled) this.nextRunAt = this.schedule.nextRunAfter(data.now)
		this.validate()
	}

	/**
	 * Pause or resume. Enabling RE-ARMS from `now` rather than restoring the instant the loop was
	 * paused at: a loop switched off for a fortnight and back on must fire at its next occurrence, not
	 * immediately because a stale timestamp is far in the past.
	 */
	setEnabled(enabled: boolean, now: Date): void {
		this.enabled = enabled
		this.nextRunAt = enabled ? this.schedule.nextRunAfter(now) : undefined
	}

	/**
	 * It fired. Record when, and arm the next occurrence.
	 *
	 * `nextRunAfter` is STRICTLY after `firedAt`, which is what stops a loop that fires late (the
	 * daemon was asleep at 09:00 and swept at 09:04) from immediately being due again for the same run.
	 */
	markFired(firedAt: Date): void {
		this.lastFiredAt = firedAt
		this.nextRunAt = this.schedule.nextRunAfter(firedAt)
	}

	/**
	 * This run does not happen — move to the next one WITHOUT claiming it fired.
	 *
	 * The conversation was paused, or deleted, or the daemon woke up hours after the alarm. All three
	 * mean the same thing to the loop: skip. It is a separate transition from `markFired` precisely
	 * because `lastFiredAt` is shown to the operator — writing it here would make the console report a
	 * whisper that was never delivered, which is the one lie a scheduling feature must not tell.
	 */
	skipRun(now: Date): void {
		this.nextRunAt = this.schedule.nextRunAfter(now)
	}

	/** Whether the sweep should fire this loop at `now`. The same predicate the SQL due-filter encodes,
	 *  stated once in the domain so a test can assert it without a database. */
	isDue(now: Date): boolean {
		return this.enabled && this.nextRunAt !== undefined && this.nextRunAt.getTime() <= now.getTime()
	}
}

export interface Loop extends LoopProps {}
