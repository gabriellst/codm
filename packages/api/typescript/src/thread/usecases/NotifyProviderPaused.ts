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

export const NotifyProviderPausedInputSchema = z.object({
	threadId: z.uuid(),
	/** When the provider account's usage window resets — the instant the queue resumes. */
	until: z.date(),
})

export const NotifyProviderPausedOutputSchema = z.object({ notified: z.boolean() })

/**
 * Tell a conversation that its answer is waiting on the provider's usage limit — and until when.
 *
 * ### Why this exists
 * Measured 2026-10-30: the account hit its 5-hour limit twice in an afternoon, and the three groups saw
 * only the 👀 cue and then silence until somebody asked. The queue now WAITS for the reset instead of
 * burning retries (`LibSqlMailboxDispatcher`), and a wait nobody can see is indistinguishable from a
 * broken product — so each conversation that is owed an answer is told once per pause window.
 *
 * ### Not a Stop
 * A Stop is a Needs-you card: a decision for the operator. Here there is nothing to decide — the queue
 * resumes on its own at `until` — so this records a SYSTEM line and delivers it, and raises nothing.
 * Same durable shape as `RaiseStop`'s channel notice: transcript entry and `deliver_channel_message` in
 * one transaction, `jobId` = the entry id, no agent runner involved (which is the point: the agent cannot
 * speak right now).
 *
 * ### Through the output policy (fase 3)
 * It is the `PROVIDER_LIMIT` block notice: already one per pause, so it only asks the group's mode where a
 * `BLOCK_NOTICE` goes (`ROUTING_BY_MODE`) and records the routing on the entry. Every mode sends it today.
 */
@injectable()
export class NotifyProviderPaused extends Handler<typeof NotifyProviderPausedInputSchema, typeof NotifyProviderPausedOutputSchema> {
	readonly name = 'notify_provider_paused' as const
	readonly inputSchema = NotifyProviderPausedInputSchema
	readonly outputSchema = NotifyProviderPausedOutputSchema

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
				text: THREAD_MESSAGES.providerPausedNotice(language, { until: input.until, now: new Date() }),
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
