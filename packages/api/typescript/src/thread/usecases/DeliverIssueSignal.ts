import { injectable } from 'tsyringe-neo'
import { BaseError, CommandQueue, Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueSignalLevel, OutputRouting } from '@codm/contracts-typescript/wire/enums'
import { CloudSession } from '@shared/services/CloudSession'
import { resolveThreadLanguage } from '@shared/i18n/messages'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { PanelPublisher } from '@issue/services/PanelPublisher'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { enqueueSignalDelivery, recordIssueSignal } from '../utils/issueSignal'
import type { ApplicationErrors } from '../errors'

export const DeliverIssueSignalInputSchema = z.object({
	threadId: z.uuid(),
	issueId: z.uuid(),
	level: z.enum(IssueSignalLevel),
	text: z.string().trim().min(1),
	addresseeId: z.string().min(1).optional(),
})
export const DeliverIssueSignalOutputSchema = z.object({
	entryId: z.uuid(),
	routing: z.enum(OutputRouting),
})

/**
 * Deliver what an issue says to its group, through the OUTPUT POLICY (fase 3, item 2) — the one door an
 * issue's spontaneous signal (feedback, progress, closing: slices S5b/S6) takes to the channel. It records
 * the entry with the issue, its level and the routing the group's mode gave it, and queues the delivery
 * when the routing sends now; a PANEL routing stays in the timeline. A DIGEST routing goes out on its own
 * until the digest flush exists (`DELIVERED_AS`, slice S5b).
 *
 * The stops' own signals (decisions, questions, block notices) go through `RaiseStop`, which shares
 * `recordIssueSignal` so the policy and the formats are written once.
 */
@injectable()
export class DeliverIssueSignal extends Handler<typeof DeliverIssueSignalInputSchema, typeof DeliverIssueSignalOutputSchema> {
	readonly name = 'deliver_issue_signal' as const
	readonly inputSchema = DeliverIssueSignalInputSchema
	readonly outputSchema = DeliverIssueSignalOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly issues: IssueRepository,
		private readonly session: CloudSession,
		private readonly panel: PanelPublisher,
		private readonly commands: CommandQueue,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const thread = await this.threads.findById(input.threadId, tx)
		if (!thread) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)
		const issue = await this.issues.findById(input.issueId, tx)
		if (!issue) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)

		const ownerLanguage = thread.language ? undefined : (await this.session.identity())?.user.language
		const language = resolveThreadLanguage(thread.language, ownerLanguage)

		return this.withTransaction(tx, async tx => {
			const { entry, routing, sends } = recordIssueSignal(
				thread,
				{
					issue: { issueId: issue.id.value, key: issue.key, title: issue.title },
					level: input.level,
					text: input.text,
					addresseeId: input.addresseeId,
				},
				{ language, panelLink: this.panel.linkOf(thread.id.value) },
			)
			await this.threads.save(thread, tx)
			if (sends) await enqueueSignalDelivery(this.commands, thread, entry, tx)
			return { entryId: entry.entryId, routing }
		})
	}
}
