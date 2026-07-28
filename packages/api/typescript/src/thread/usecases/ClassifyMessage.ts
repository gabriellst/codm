import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { BufferSize, ClassificationMethod, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { IssueRouter } from '@agent/services/IssueRouter'
import { WorkspaceRepository } from '@workspace/repositories'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { TranscriptRepository } from '../repositories/TranscriptRepository'
import { ClarificationRepository } from '../repositories/ClarificationRepository'
import { OpenIssuesReader } from '../services/OpenIssuesReader'
import { MessageClassifiedEvent, ClarificationRequestedEvent } from '../events'
import type { ApplicationErrors, ThreadDomainErrors } from '../errors'

export const ClassifyMessageInputSchema = z.object({
	threadId: z.uuid(),
	entryId: z.uuid(),
})

export const ClassifyMessageOutputSchema = z.object({
	method: z.enum(ClassificationMethod),
	issueId: z.uuid().optional(),
})

/**
 * C17 ClassifyMessage — demultiplexes one inbound entry into an issue via the agent context's
 * `IssueRouter` (reply-quote > context-match ≥ threshold > new-issue > clarification). Reply-quotes
 * are resolved to an issueId here (channel-native quotedEntryId → the quoted entry's issueId) and
 * passed to the router as authoritative. Publishes `thread.message_classified` (bridged to
 * `integration.message.classified`, which the agent context consumes to run the turn); an ambiguous
 * decision opens a clarification (max one open per sender) instead.
 *
 * ### Why a use case invokes an agent-context service at all (§5.2)
 * The medscall forbids it — there, an agent produces the user-visible reply, which is a side effect
 * and therefore a handler's job. Here the routing DECISION has to be consumed inside this very
 * transaction (the transcript line and the clarification are persisted with it), so making it
 * event-driven would split one decision across two transactions and buy a saga for nothing. What is
 * injected is the ROUTER, not the agent: the reply-quote shortcut, the confidence floor, the slug
 * minting and the clarify fallback are policy owned by the agent context, and pulling them up here
 * would spread one decision across two contexts.
 *
 * `cwd` for the classification run is the thread's bound WORKSPACE path, resolved here — never
 * `process.cwd()`. §4.6 is explicit that an implicit process cwd is the worst possible default in a
 * product that runs inside the user's real repositories, and a thread cannot be attached without a
 * workspace, so the row is always there to read.
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
		private readonly workspaces: WorkspaceRepository,
		private readonly router: IssueRouter,
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

		const workspace = await this.workspaces.findById(thread.workspaceId)
		if (!workspace) throw new BaseError<ApplicationErrors>('WORKSPACE_NOT_FOUND', `no workspace ${thread.workspaceId}`)

		// The thread's PRIMARY CLI — the same `providers[0]` the turn itself runs under
		// (`RunIssueTurnOnClassification`), so a message is classified by the CLI that will answer it.
		// `Thread` enforces `providers.min(1)` at create and at attach, so an empty list here means the
		// row predates that invariant or was written around it; failing named beats classifying under a
		// CLI nobody chose.
		const provider = thread.providers[0]
		if (!provider) throw new BaseError<ThreadDomainErrors>('NO_PROVIDER_SELECTED', `thread ${input.threadId} has no provider`)

		const decision = await this.router.classify({
			ownerId: thread.ownerId,
			threadId: input.threadId,
			provider,
			cwd: workspace.path,
			message: entry.text,
			quotedIssueId,
			openIssues,
			contextBuffer: buffer,
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

	private async appendAction(
		ownerId: string,
		input: this['input'],
		method: ClassificationMethod,
		tx: Transaction,
		issueId?: string,
	): Promise<void> {
		// Every classification decision is appended as an ACTION line (auditability NFR).
		await this.transcript.append(
			{ ownerId, threadId: input.threadId, kind: TranscriptKind.ACTION, text: `classified: ${method}`, classification: method, issueId },
			tx,
		)
	}

	/**
	 * `BufferSize`, not `string` — the parameter type is what `local/no-enum-widening` is about. Widening
	 * here would let a caller pass any string and lose the compile error the day a new member lands with
	 * a non-numeric spelling, at which point the fallback below would silently swallow it.
	 */
	private bufferLimit(bufferSize: BufferSize): number {
		const n = Number.parseInt(bufferSize, 10)
		return Number.isFinite(n) && n > 0 ? n : 50
	}
}
