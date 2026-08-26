import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { MessageVia } from '@agent/enums'
import { OpenIssuesReader } from '../services/OpenIssuesReader'
import { OPERATOR_PARTICIPANT_ID } from '../entities/Thread'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ThreadSteeredEvent } from '../events/ThreadSteeredEvent'
import type { ApplicationErrors } from '../errors'

export const SteerThreadInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	text: z.string().trim().min(1),
	/**
	 * The LABEL of the loop that scheduled this whisper — absent ⟺ a human typed it right now.
	 *
	 * `FireDueLoops` composes this use case rather than reimplementing it, which is right, and until this
	 * field existed it also made the two indistinguishable downstream: a tick and an operator whisper
	 * landed as the same `speaker: 'operator'` and the agent answered a timer as if somebody were sitting
	 * there. It is DECLARED here rather than inferred from a caller, so the transcript entry and the
	 * mailbox item can both say which one this was.
	 */
	firedByLoop: z.string().min(1).optional(),
})
export const SteerThreadOutputSchema = z.object({ entryId: z.uuid() })

/**
 * C19 SteerThread — a whisper (never delivered to the channel). Rejected when paused (`THREAD_PAUSED`
 * — use direct mode instead). Appends a WHISPER transcript entry and fans out to every active issue's
 * agent context (via `thread.steered`).
 */
@injectable()
export class SteerThread extends Handler<typeof SteerThreadInputSchema, typeof SteerThreadOutputSchema> {
	readonly name = 'steer_thread' as const
	readonly inputSchema = SteerThreadInputSchema
	readonly outputSchema = SteerThreadOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly openIssues: OpenIssuesReader,
		private readonly mailbox: MailboxRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.ownerId !== input.ownerId)
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		// Read BEFORE the transaction, not inside it. `OpenIssuesReader` is a read SEAM and takes no
		// `tx`, and the tx-discipline rail is right to refuse an untethered `await this.*` in a
		// transaction callback — a read that cannot join the transaction should not pretend to. The race
		// this admits is benign: an issue that closes between the read and the enqueue gets a steer item
		// whose target is already finished, and the dispatcher drops it.
		const active = await this.openIssues.openIssues(thread.id.value)

		return this.withTransaction(tx, async tx => {
			// The WHISPER is recorded BY THE AGGREGATE (B4, decision 1) and persisted by `save` in this
			// same transaction — the id it returns is what the mailbox items below dedup on, so it has to
			// exist before anything references it, which is exactly why `recordEntry` mints synchronously.
			const entry = thread.recordEntry({ kind: TranscriptKind.WHISPER, text: input.text, firedByLoop: input.firedByLoop })
			await this.threads.save(thread, tx)

			await this.domainEventRepository.save(
				new ThreadSteeredEvent({
					entityId: thread.id.value,
					ownerId: thread.ownerId,
					payload: { threadId: thread.id.value, entryId: entry.entryId, text: input.text },
				}),
				tx,
			)

			// THE STEER NOW SCHEDULES SOMETHING (B2). Until here `thread.steered` had ZERO consumers: the
			// whisper landed in the transcript and nothing ever acted on it, which is exactly what the
			// founder hit — "mandei steer e ele não perguntou de novo".
			//
			// Enqueued in THIS transaction, so a whisper that commits always schedules and one that rolls
			// back never does. The dedup key is the ENTRY: one whisper, one redirection, however many
			// times the write is retried.
			for (const issue of active) {
				await this.mailbox.enqueue(
					{
						ownerId: thread.ownerId,
						targetKind: MailboxTargetKind.ISSUE,
						targetId: issue.issueId,
						kind: MailboxItemKind.STEER,
						payload: {
							issueId: issue.issueId,
							threadId: thread.id.value,
							key: issue.key,
							title: issue.title,
							text: input.text,
							// It travels to the WORKING agent for the same reason it travels to the orchestrator:
							// the issue prompt renders this redirection as a `<msg>` block, and a tick that reads
							// `de="operator"` tells the worker somebody is sitting there waiting on the answer.
							firedByLoop: input.firedByLoop,
						},
						dedupKey: `steer:${entry.entryId}:${issue.issueId}`,
					},
					tx,
				)
			}

			// NO ACTIVE ISSUE — the whisper is for the ORCHESTRATOR, and this is a deliberate extension of
			// §7.7 rather than something the spec says. §7.7 defines steer only against issues, so a
			// whisper sent while nothing is running would land in the transcript and die there. That is
			// precisely the case the founder exercised ("pergunte mais uma vez se ele está bem", with no
			// issue in flight), so treating it as a message TO the orchestrator is what makes the feature
			// do what it visibly promises. Flagged in the commit as a divergence, not smuggled in.
			if (active.length === 0) {
				await this.mailbox.enqueue(
					{
						ownerId: thread.ownerId,
						targetKind: MailboxTargetKind.THREAD,
						targetId: thread.id.value,
						kind: MailboxItemKind.OPERATOR_MESSAGE,
						payload: {
							kind: MailboxItemKind.OPERATOR_MESSAGE,
							entryId: entry.entryId,
							// WHO the model is told said this. A tick is not the operator: it says so in `speaker`,
							// which is the attribute the prompt renders verbatim, and `via` carries the fact both
							// members share — nobody in the room saw this line.
							speaker: input.firedByLoop ? `${MessageVia.LOOP}:${input.firedByLoop}` : OPERATOR_PARTICIPANT_ID,
							via: input.firedByLoop ? MessageVia.LOOP : MessageVia.STEER,
							text: input.text,
						},
						dedupKey: entry.entryId,
					},
					tx,
				)
			}

			return { entryId: entry.entryId }
		})
	}
}
