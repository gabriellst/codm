import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { ClassificationMethod, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { IssueClassifier } from '@terminal/services/IssueClassifier'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { TranscriptRepository } from '../repositories/TranscriptRepository'
import { ClarificationRepository } from '../repositories/ClarificationRepository'
import { OpenIssuesReader } from '../services/OpenIssuesReader'
import { MessageClassifiedEvent, ClarificationRequestedEvent } from '../events'
import type { ApplicationErrors } from '../errors'

export const ClassifyMessageInputSchema = z.object({
	threadId: z.uuid(),
	entryId: z.uuid(),
})

export const ClassifyMessageOutputSchema = z.object({
	method: z.enum(ClassificationMethod),
	issueId: z.uuid().optional(),
})

/**
 * C17 ClassifyMessage — demultiplexes one inbound entry into an issue via the phase-5 IssueClassifier
 * (reply-quote > context-match ≥ threshold > new-issue > clarification). Reply-quotes are resolved
 * to an issueId here (channel-native quotedEntryId → the quoted entry's issueId) and passed to the
 * classifier as authoritative. Publishes `thread.message_classified` (bridged to
 * `integration.message.classified`, which the terminal engine consumes to spawn/continue the
 * session); an ambiguous decision opens a clarification (max one open per sender) instead.
 */
@injectable()
export class ClassifyMessage extends Handler<typeof ClassifyMessageInputSchema, typeof ClassifyMessageOutputSchema> {
	readonly name = 'classify_message' as const
	readonly inputSchema = ClassifyMessageInputSchema
	readonly outputSchema = ClassifyMessageOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly transcript: TranscriptRepository,
		private readonly clarifications: ClarificationRepository,
		private readonly openIssues: OpenIssuesReader,
		private readonly classifier: IssueClassifier,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		const entry = await this.transcript.findById(input.entryId)
		if (!entry || entry.threadId !== input.threadId) throw new BaseError<ApplicationErrors>('ENTRY_NOT_FOUND', `no entry ${input.entryId}`)

		// Reply-quote authority: resolve the quoted entry → its issueId BEFORE any LLM call.
		const quotedIssueId = entry.quotedEntryId ? await this.openIssues.issueIdForEntry(entry.quotedEntryId) : undefined
		const openIssues = await this.openIssues.openIssues(input.threadId)
		const buffer = (await this.transcript.recentByThread(input.threadId, this.bufferLimit(thread.bufferSize))).map(e => e.text)

		const decision = await this.classifier.classify({
			message: entry.text,
			quotedIssueId,
			openIssues,
			contextBuffer: buffer,
			provider: thread.providers[0],
		})

		return this.withTransaction(tx, async tx => {
			if (decision.kind === 'CLARIFY') {
				const senderExternalId = entry.senderExternalId ?? ''
				if (await this.clarifications.findOpen(input.threadId, senderExternalId, tx)) {
					throw new BaseError<ApplicationErrors>('CLARIFICATION_ALREADY_PENDING', 'a clarification is already open for this sender')
				}
				await this.clarifications.open(
					{
						ownerId: thread.ownerId,
						threadId: input.threadId,
						entryId: input.entryId,
						senderExternalId,
						question: decision.question,
						candidateIssueIds: decision.candidateIssueIds,
					},
					tx,
				)
				await this.appendAction(thread.ownerId, input, ClassificationMethod.CLARIFIED, tx)
				await this.domainEventRepository.save(
					new ClarificationRequestedEvent({
						entityId: input.threadId,
						ownerId: thread.ownerId,
						payload: {
							threadId: input.threadId,
							entryId: input.entryId,
							channelId: thread.channelId,
							contactExternalId: thread.contactRef.externalId,
							contactDisplayName: thread.contactRef.displayName,
							contactKind: thread.contactRef.kind,
							question: decision.question,
							candidateIssueIds: decision.candidateIssueIds,
						},
					}),
					tx,
				)
				return { method: ClassificationMethod.CLARIFIED, issueId: undefined }
			}

			const method = decision.kind === 'MATCH_ISSUE' ? decision.method : ClassificationMethod.NEW_ISSUE
			const issueId = decision.kind === 'MATCH_ISSUE' ? decision.issueId : undefined
			if (issueId) await this.transcript.setIssueId(input.entryId, issueId, tx)

			await this.appendAction(thread.ownerId, input, method, tx, issueId)
			await this.domainEventRepository.save(
				new MessageClassifiedEvent({
					entityId: input.threadId,
					ownerId: thread.ownerId,
					payload: { threadId: input.threadId, entryId: input.entryId, method, issueId },
				}),
				tx,
			)
			return { method, issueId }
		})
	}

	private async appendAction(ownerId: string, input: this['input'], method: ClassificationMethod, tx: Transaction, issueId?: string): Promise<void> {
		// Every classification decision is appended as an ACTION line (auditability NFR).
		await this.transcript.append(
			{ ownerId, threadId: input.threadId, kind: TranscriptKind.ACTION, text: `classified: ${method}`, classification: method, issueId },
			tx,
		)
	}

	private bufferLimit(bufferSize: string): number {
		const n = Number.parseInt(bufferSize, 10)
		return Number.isFinite(n) && n > 0 ? n : 50
	}
}
