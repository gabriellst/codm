import { injectable } from 'tsyringe-neo'
import { BaseError, CommandQueue, Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueSignalLevel, OutputRouting } from '@codm/contracts-typescript/wire/enums'
import { CloudSession } from '@shared/services/CloudSession'
import { resolveThreadLanguage } from '@shared/i18n/messages'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { PanelPublisher } from '@issue/services/PanelPublisher'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { enqueueSignalDelivery, QUOTES_ORIGIN, recordIssueSignal } from '../utils/issueSignal'
import type { ApplicationErrors } from '../errors'

export const DeliverIssueSignalInputSchema = z.object({
	threadId: z.uuid(),
	issueId: z.uuid(),
	level: z.enum(IssueSignalLevel),
	/** The issue's words. Empty only for a CLOSING nobody declared (the format then says "concluída"). */
	text: z.string().trim(),
	addresseeId: z.string().min(1).optional(),
	/** The artifact a FEEDBACK previews — the group gets it with the message when it goes out alone. */
	mainArtifactId: z.uuid().optional(),
	/** Every artifact the signal cites (the main one included) — the others are counted, and stay on the console. */
	artifactIds: z.array(z.uuid()).optional(),
	/**
	 * The person's message this signal is the reply to (a closing declared by a turn that was answering a steer
	 * routed from the group). It is quoted instead of the request, and the signal reaches the group whatever the
	 * mode: a reply to a person is not the issue talking on its own.
	 */
	answersEntryId: z.uuid().optional(),
	/**
	 * What makes delivering the same signal twice a no-op: it becomes the entry's id. A redelivered fact finds
	 * its entry already recorded and sends nothing more (its delivery was queued with it, in the same commit).
	 */
	signalId: z.uuid(),
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
		private readonly consumed: ConsumedMessageRepository,
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
		const origin = issue.originEntryId ? await this.threads.findEntry(issue.originEntryId, tx) : undefined
		const requesterId = origin?.senderExternalId
		// A reply to a person quotes THEIR message (it must be this conversation's).
		const answered = input.answersEntryId ? await this.threads.findEntry(input.answersEntryId, tx) : undefined
		const answers = answered?.threadId === thread.id.value ? answered : undefined
		// The closing answers whoever asked (`QUOTES_ORIGIN`): it quotes their message — in the transcript and on
		// the wire, when the platform id of that message is known (a request typed elsewhere has none).
		const quoted = answers ?? (QUOTES_ORIGIN[input.level] && origin?.threadId === thread.id.value ? origin : undefined)
		const quotedMessageId = quoted ? await this.consumed.findPlatformId(quoted.entryId, tx) : undefined
		const others = (input.artifactIds ?? []).filter(artifactId => artifactId !== input.mainArtifactId).length

		return this.withTransaction(tx, async tx => {
			// ALREADY SAID — the signal's entry committed with its delivery, so there is nothing left to do. Read in
			// the write transaction; a concurrent twin loses on the entry's primary key and its retry lands here.
			const said = await this.threads.findEntry(input.signalId, tx)
			if (said?.routing) return { entryId: said.entryId, routing: said.routing }

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
					entryId: input.signalId,
					quotedEntry: quoted ? { entryId: quoted.entryId, threadId: quoted.threadId } : undefined,
					answersPerson: answers !== undefined,
				},
				{ language, panelLink: this.panel.linkOf(thread.id.value) },
			)
			await this.threads.save(thread, tx)
			await enqueueSignalDelivery(this.commands, thread, entry, routing, tx, { quotedMessageId })
			return { entryId: entry.entryId, routing }
		})
	}
}
