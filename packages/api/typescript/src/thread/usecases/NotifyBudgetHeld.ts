import { injectable } from 'tsyringe-neo'
import { Handler, z, CommandQueue } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueSignalLevel, MessageAuthor, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { CloudSession } from '@shared/services/CloudSession'
import { resolveThreadLanguage } from '@shared/i18n/messages'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { THREAD_MESSAGES } from '../i18n/messages'
import { routeSignal, SENDS_NOW } from '../utils/OutputPolicy'
import type { DeliverChannelMessage } from './DeliverChannelMessage'

export const NotifyBudgetHeldInputSchema = z.object({
	threadId: z.uuid(),
	/** When the budget expects the task lane to reopen — absent when it cannot say. */
	until: z.date().optional(),
})

export const NotifyBudgetHeldOutputSchema = z.object({ notified: z.boolean() })

/**
 * Tell a conversation that its tasks are HELD by the quota budget (fase 4, item 2 — `BlockCause.BUDGET_HELD`) — and
 * that the orchestrator keeps answering. The sibling of `NotifyProviderPaused`, and not a Stop for the same reason:
 * there is nothing to decide, the lane reopens on its own.
 *
 * One notice per conversation while the hold lasts — the dispatcher owns that (the cause groups, `CAUSE_DEDUPES`) and
 * calls this only when the budget is ENFORCED: in observation nothing is held, so nothing is said (the declared
 * table `ANNOUNCES_HOLD`, not an `if` here). Through the output policy as a `BLOCK_NOTICE`.
 */
@injectable()
export class NotifyBudgetHeld extends Handler<typeof NotifyBudgetHeldInputSchema, typeof NotifyBudgetHeldOutputSchema> {
	readonly name = 'notify_budget_held' as const
	readonly inputSchema = NotifyBudgetHeldInputSchema
	readonly outputSchema = NotifyBudgetHeldOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly session: CloudSession,
		private readonly commands: CommandQueue,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread) return { notified: false }

		const ownerLanguage = thread.language ? undefined : (await this.session.identity())?.user.language
		const language = resolveThreadLanguage(thread.language, ownerLanguage)

		return this.withTransaction(tx, async tx => {
			const routing = routeSignal(thread.outputMode, IssueSignalLevel.BLOCK_NOTICE)
			const entry = thread.recordEntry({
				kind: TranscriptKind.SYSTEM,
				text: THREAD_MESSAGES.budgetHeldNotice(language, { until: input.until, now: new Date() }),
				level: IssueSignalLevel.BLOCK_NOTICE,
				routing,
			})
			await this.threads.save(thread, tx)
			if (!SENDS_NOW[routing]) return { notified: false }
			await this.commands.enqueueCommand<DeliverChannelMessage>(
				'deliver_channel_message',
				{
					ownerId: thread.ownerId,
					channelId: thread.channelId,
					contactExternalId: thread.contactRef.externalId,
					text: entry.text,
					author: MessageAuthor.SYSTEM,
					replyEntryId: entry.entryId,
					replyThreadId: thread.id.value,
					reactionsEnabled: thread.reactionsEnabled,
				},
				{ jobId: entry.entryId },
				tx,
			)
			return { notified: true }
		})
	}
}
