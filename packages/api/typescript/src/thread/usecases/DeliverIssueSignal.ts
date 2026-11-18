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
	/** The artifact a FEEDBACK previews — the group gets it with the message when it goes out alone. */
	mainArtifactId: z.uuid().optional(),
	/** Every artifact the signal cites (the main one included) — the others are counted, and stay on the console. */
	artifactIds: z.array(z.uuid()).optional(),
})
export const DeliverIssueSignalOutputSchema = z.object({
	entryId: z.uuid(),
	routing: z.enum(OutputRouting),
})

/**
 * Deliver what an issue says to its group, through the OUTPUT POLICY (fase 3, item 2) — the one door an
 * issue's spontaneous signal (feedback, progress, closing: slices S5b/S6) takes to the channel. It records
 * the entry with the issue, its level, the routing the group's mode gave it and the person it is for (the
 * declared addressee, or whoever wrote the message the issue came from), and hands it to the channel by
 * that routing (`enqueueSignalDelivery`): now, in its person's digest, or never (the panel).
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
		const requesterId = issue.originEntryId ? (await this.threads.findEntry(issue.originEntryId, tx))?.senderExternalId : undefined
		const others = (input.artifactIds ?? []).filter(artifactId => artifactId !== input.mainArtifactId).length

		return this.withTransaction(tx, async tx => {
			const { entry, routing } = recordIssueSignal(
				thread,
				{
					issue: { issueId: issue.id.value, key: issue.key, title: issue.title },
					level: input.level,
					text: input.text,
					addresseeId: input.addresseeId,
					requesterId,
					artifactId: input.mainArtifactId,
					moreArtifacts: others,
				},
				{ language, panelLink: this.panel.linkOf(thread.id.value) },
			)
			await this.threads.save(thread, tx)
			await enqueueSignalDelivery(this.commands, thread, entry, routing, tx)
			return { entryId: entry.entryId, routing }
		})
	}
}
