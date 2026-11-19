import { injectable } from 'tsyringe-neo'
import { Handler, LoggingService, tryCatchAsync, z } from '@codm/core-typescript'
import { MailboxClaimClass, MailboxItemKind, MailboxTargetKind, PermissionPosture, StopKind } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { MessageVia } from '@agent/enums'
import { CloudSession } from '@shared/services/CloudSession'
import { resolveThreadLanguage } from '@shared/i18n/messages'
import type { Batch } from '../entities/Batch'
import type { Thread } from '../entities/Thread'
import { THREAD_MESSAGES } from '../i18n/messages'
import { BatchRepository } from '../repositories/BatchRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { RaiseStop } from './RaiseStop'

export const FollowUpIncompleteBatchesInputSchema = z.object({
	/** The instant the sweep judges against — handed in (the core has no clock), so a test never sleeps. */
	now: z.date().optional(),
})
export const FollowUpIncompleteBatchesOutputSchema = z.object({
	reminded: z.number().int().nonnegative(),
	stalled: z.number().int().nonnegative(),
})

/** How often the sweep runs. */
export const FOLLOW_UP_INCOMPLETE_BATCHES_INTERVAL_MS = 60 * 1000
/** A batch still without destinations this long after it arrived — with the orchestrator idle — gets the reminder. */
export const BATCH_REMIND_AFTER_MS = 10 * 60 * 1000
/** Still without destinations this long after it arrived, the reminder already given: the conversation's STALLED notice. */
export const BATCH_STALL_AFTER_MS = 2 * BATCH_REMIND_AFTER_MS
/** How far back the sweep looks — a batch abandoned longer ago than this is not chased any more. */
export const BATCH_FOLLOW_UP_HORIZON_MS = 7 * 24 * 60 * 60 * 1000
/** Who the reminder is from, as the orchestrator's prompt renders the speaker — codm itself, not a person. */
export const BATCH_REMINDER_SPEAKER = 'codm'

/**
 * A BATCH LEFT INCOMPLETE (fase 4, item 5) — the turn that got the batch ended without recording every destination.
 *
 * Judged on persisted state by a repeated sweep (SCH-01/02), and ONLY while the conversation's orchestrator has
 * nothing left to run (`hasPending`): a batch waiting behind other messages is not late, its turn has not come.
 *  1. `BATCH_REMIND_AFTER_MS` after it arrived: ONE reminder to the orchestrator — an item of the conversation
 *     (class `REMINDER`, never ahead of anybody's message), carrying the batch again, keyed on the batch so it is
 *     queued once (`enqueue` answers false the second time — which is how the sweep knows it was reminded);
 *  2. `BATCH_STALL_AFTER_MS` after it arrived, reminded and still incomplete: the conversation's `STALLED` notice,
 *     raised under the batch's own id — one per batch, and an operator who resolves it is never asked again.
 * Each batch in its own call, so one failure never holds the rest.
 */
@injectable()
export class FollowUpIncompleteBatches extends Handler<
	typeof FollowUpIncompleteBatchesInputSchema,
	typeof FollowUpIncompleteBatchesOutputSchema
> {
	readonly name = 'follow_up_incomplete_batches' as const
	readonly inputSchema = FollowUpIncompleteBatchesInputSchema
	readonly outputSchema = FollowUpIncompleteBatchesOutputSchema

	/** The cadence, on the job it governs (T1.4). */
	static readonly repeat = { every: FOLLOW_UP_INCOMPLETE_BATCHES_INTERVAL_MS }

	constructor(
		private readonly batches: BatchRepository,
		private readonly threads: ThreadRepository,
		private readonly mailbox: MailboxRepository,
		private readonly raiseStop: RaiseStop,
		private readonly session: CloudSession,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const now = input.now ?? new Date()
		const due = await this.batches.findIncomplete(
			new Date(now.getTime() - BATCH_FOLLOW_UP_HORIZON_MS),
			new Date(now.getTime() - BATCH_REMIND_AFTER_MS),
		)
		let reminded = 0
		let stalled = 0
		for (const batch of due) {
			const outcome = await tryCatchAsync(() => this.followUp(batch, now))
			if (outcome.success) {
				reminded += outcome.data === 'REMINDED' ? 1 : 0
				stalled += outcome.data === 'STALLED' ? 1 : 0
				continue
			}
			this.logging.warn({
				content: {
					message: 'incomplete batch not followed up — the next sweep tries again',
					batchId: batch.id.value,
					reason: outcome.error.message,
				},
			})
		}
		return { reminded, stalled }
	}

	private async followUp(batch: Batch, now: Date): Promise<'REMINDED' | 'STALLED' | 'WAITING'> {
		if (await this.mailbox.hasPending(MailboxTargetKind.THREAD, batch.threadId)) return 'WAITING'
		const thread = await this.threads.findById(batch.threadId)
		if (!thread || thread.deletedAt) return 'WAITING'
		if (await this.remind(thread, batch)) return 'REMINDED'
		if (now.getTime() - batch.createdAt.getTime() < BATCH_STALL_AFTER_MS) return 'WAITING'
		if (await this.threads.findStop(batch.id.value)) return 'WAITING'
		const ownerLanguage = thread.language ? undefined : (await this.session.identity())?.user.language
		const language = resolveThreadLanguage(thread.language, ownerLanguage)
		await this.raiseStop.execute({
			stopId: batch.id.value,
			threadId: thread.id.value,
			kind: StopKind.STALLED,
			detail: THREAD_MESSAGES.batchStalled(language, { code: batch.code, total: batch.items.length }),
		})
		return 'STALLED'
	}

	/** Queue the reminder — `false` when it was queued before (its dedup key is the batch). */
	private async remind(thread: Thread, batch: Batch): Promise<boolean> {
		const ownerLanguage = thread.language ? undefined : (await this.session.identity())?.user.language
		const language = resolveThreadLanguage(thread.language, ownerLanguage)
		return this.mailbox.enqueue({
			ownerId: thread.ownerId,
			targetKind: MailboxTargetKind.THREAD,
			targetId: thread.id.value,
			kind: MailboxItemKind.OPERATOR_MESSAGE,
			// codm reminding, not somebody's message: never ahead of anybody's, never merged with a steer.
			claimClass: MailboxClaimClass.REMINDER,
			// Nobody triggered it, so nobody's grant applies.
			posture: PermissionPosture.AUTO,
			payload: {
				kind: MailboxItemKind.OPERATOR_MESSAGE,
				// The batch's own message — the line the reminder is about, and what a quote would attach to.
				entryId: batch.sourceEntryId,
				speaker: BATCH_REMINDER_SPEAKER,
				// The room never saw this line: it is between codm and the agent.
				via: MessageVia.STEER,
				text: THREAD_MESSAGES.batchReminder(language, { code: batch.code, total: batch.items.length }),
				batch: {
					batchCode: batch.code,
					total: batch.items.length,
					pending: batch.pending().map(item => ({ n: item.n, excerpt: item.excerpt })),
				},
			},
			dedupKey: `batch-reminder:${batch.id.value}`,
		})
	}
}
