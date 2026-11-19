import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { StopResolution } from '@codm/contracts-typescript/wire/enums'
import { AskAnswerSchema } from '@shared/objects'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ANSWER_GATE, gateOf, REFUSED_AS } from '../utils/answerRules'
import type { ApplicationErrors } from '../errors'

export const AnswerStopInputSchema = z.object({
	ownerId: z.uuid(),
	stopId: z.uuid(),
	/** A person's answer — one of the ask's options, or free text. */
	answer: AskAnswerSchema,
	/**
	 * WHO answered, as the thread's roster knows them — the address of someone in the group, or `operator` for
	 * the console. Decides whether they may answer this ask (`ANSWER_GATE`) and the posture the resume runs under.
	 */
	answeredBy: z.string().min(1),
	/**
	 * The conversation the caller is confined to — the group a reply was typed in, the panel's group. A stop of
	 * another conversation is refused exactly like a missing one. Absent for the console, which is the owner's.
	 */
	threadId: z.uuid().optional(),
})
export const AnswerStopOutputSchema = z.void()

/**
 * Answer an issue's ask — a decision or a question — with an option or free text (fase 3, item 3).
 *
 * THE ONE DOOR THAT CARRIES THE ANSWER. `ResolveStop` is the bare door (a resolution by its name alone) and
 * refuses `ANSWER`, because an answer without the answer means nothing. Every place a person answers comes
 * through here: the console (`POST /stops/:stopId/answer`), the group (a quoted reply, a code, a bare "sim" —
 * `IngestChannelMessage`, inside its own transaction) and, from slice S8b, the panel's `ANSWER_ASK`.
 *
 * Who may answer is the ruler `ANSWER_GATE` (owner decision 18/11): an ask with a declared effect only by
 * someone who may release, any other by anyone who may act — refused with the gate's named code. The stop is
 * read INSIDE the transaction and the aggregate refuses a stop already answered (`STOP_ALREADY_RESOLVED`); the
 * conditional UPDATE of `ThreadRepository.save` is the backstop, so of two answers only the first one lands.
 *
 * The answer reaches the session through `thread.stop_resolved` → `ResumeIssueOnStopResolved`, which always
 * queues the resume for an answer, with the question, its code and what was answered.
 */
@injectable()
export class AnswerStop extends Handler<typeof AnswerStopInputSchema, typeof AnswerStopOutputSchema> {
	readonly name = 'answer_stop' as const
	readonly inputSchema = AnswerStopInputSchema
	readonly outputSchema = AnswerStopOutputSchema

	constructor(private readonly threads: ThreadRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		await this.withTransaction(tx, async tx => {
			const stop = await this.threads.findStop(input.stopId, tx)
			if (!stop || stop.ownerId !== input.ownerId || (input.threadId !== undefined && stop.threadId !== input.threadId)) {
				throw new BaseError<ApplicationErrors>('STOP_NOT_FOUND', `no stop ${input.stopId}`)
			}
			const thread = await this.threads.findById(stop.threadId, tx)
			if (!thread) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${stop.threadId}`)

			const gate = gateOf(stop)
			if (!ANSWER_GATE[gate](thread, input.answeredBy)) {
				throw new BaseError<ApplicationErrors>(REFUSED_AS[gate], `this participant may not answer stop ${stop.stopId}`)
			}

			// The resume runs with the posture of whoever answered (Decision 7, `RESUMES_WITH_RESOLVER_POSTURE`).
			thread.resolveStop(stop, StopResolution.ANSWER, thread.postureOf(input.answeredBy), {
				answer: input.answer,
				answeredBy: input.answeredBy,
			})
			await this.threads.save(thread, tx)
			await this.domainEventRepository.saveMany(thread.pullDomainEvents(), tx)
		})
	}
}
