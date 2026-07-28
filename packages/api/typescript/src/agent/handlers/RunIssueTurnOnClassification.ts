import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { EventHandler } from '@codedm/core-typescript'
import { MessageClassifiedEvent } from '@codedm/contracts-typescript/wire/events'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { TranscriptRepository } from '@thread/repositories/TranscriptRepository'
import { OpenIssuesReader } from '@thread/services/OpenIssuesReader'
import { WorkspaceRepository } from '@workspace/repositories'
import { RunIssueTurn } from '../usecases/RunIssueTurn'
import { uniqueSlugKey } from '../services/IssueRouter'

/**
 * The severed-saga closer (phase-6b). BC4 Thread & Routing demultiplexes an inbound message into an
 * issue and publishes the FROZEN `integration.message.classified`; THIS is the terminal engine's
 * trigger — the one runtime caller of `RunIssueTurn`. Consuming the fact here (never in a use
 * case) keeps the classification/routing seam clean and the engine consumed strictly by event.
 *
 * Resolution (all via existing cross-context READ seams — repositories/readers, never the SDK):
 *   - thread     → `ThreadRepository.findById` (providers + workspaceId; the run's provider is
 *                  `providers[0]`, the primary CLI bound at attach).
 *   - workspace  → `WorkspaceRepository.findById(thread.workspaceId)` (absolute `path` = the cwd).
 *   - prompt     → `TranscriptRepository.findById(entryId).text` (the classified inbound message,
 *                  the thread context's read seam into the transcript/buffer).
 *
 * issueId minting mirrors the classification DECISION carried on the fact:
 *   - MATCHED (REPLY_QUOTE / CONTEXT_MATCH → `issueId` present): continue that issue; its key/title
 *     come from the open-issues reader (the classifier's own candidate set).
 *   - NEW ISSUE (`issueId` absent): mint a fresh id + a slug key UNIQUE within the thread
 *     (`uniqueSlugKey`, mirroring the classifier), titled from the message.
 *
 * `RunIssueTurn` then runs the (stubbed-in-tests) runner and persists context-private
 * `terminal.*` facts; the existing `PublishAgentIntegrationEvents` bridge republishes them so
 * `integration.issue.opened` / `agent.reply_drafted` / `issue.completed` / `issue.stop_raised` fire
 * live — and `MaterializeIssueFromExecution` materializes the Issue row from `issue.opened`.
 *
 * Defensive drops (no throw): a fact for an unresolvable thread/entry/workspace is a no-op — the
 * same "drop the unroutable inbound" posture BC4's `ConsumeInboundMessage` takes.
 *
 * PHASE-10 FOLD (ONE inbound path): whatscode's `ChannelMessageReceivedHandler` +
 * `InboundDroppedNoMappingEvent` are NOT ported as artifacts — their surviving responsibilities
 * live here (mapping resolution → BC4 classification; drop semantics → these defensive returns;
 * session upsert → RunIssueTurn's durable session-row write).
 */
@injectable()
export class RunIssueTurnOnClassification extends EventHandler<typeof MessageClassifiedEvent> {
	readonly event = MessageClassifiedEvent

	constructor(
		private readonly threads: ThreadRepository,
		private readonly workspaces: WorkspaceRepository,
		private readonly transcript: TranscriptRepository,
		private readonly openIssues: OpenIssuesReader,
		private readonly runIssueTurn: RunIssueTurn,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		// Defensive drop (the declared posture above): an envelope without an owner is unroutable —
		// never forge one with `?? ''` (RunIssueTurn's z.uuid() would reject it downstream).
		const ownerId = event.ownerId
		if (!ownerId) return
		const { threadId, entryId, issueId } = event.payload

		const thread = await this.threads.findById(threadId)
		if (!thread) return

		const entry = await this.transcript.findById(entryId)
		if (!entry) return

		const workspace = await this.workspaces.findById(thread.workspaceId)
		if (!workspace) return

		const provider = thread.providers[0]
		if (!provider) return

		// The citation is addressing, not content: without this every issue would be titled and keyed
		// `codedm-…`, because with the gate on EVERY inbound carries the tag.
		const text = thread.textWithoutMention(entry.text)

		const resolved = await this.resolveIssue(threadId, issueId, text)

		await this.runIssueTurn.execute({
			ownerId,
			issueId: resolved.issueId,
			threadId,
			key: resolved.key,
			title: resolved.title,
			provider,
			workspacePath: workspace.path,
			prompt: text,
			messageId: entryId,
			priorMessageId: await this.conversationCursor(resolved.issueId, entryId),
		})
	}

	/**
	 * Where the issue's conversation stood BEFORE this message — the value the resume guard compares
	 * against the session row's own cursor (`AgentSession.resumeDecision`, Fase 4).
	 *
	 * Read from the ISSUE's transcript, not the thread's: one thread multiplexes many issues, and a
	 * message routed to a sibling issue never reached THIS CLI session, so it must not invalidate it.
	 * A mismatch here means a message DID enter this issue without a turn consuming it — one of the
	 * defensive drops above, or a turn that died before committing — and resuming would then answer
	 * the newest message with a context that silently skipped the ones in between.
	 *
	 * `undefined` for a brand-new issue (nothing tagged with it yet), which is correct: there is no
	 * prior position to continue from, and there is no session row to resume either.
	 */
	private async conversationCursor(issueId: string, entryId: string): Promise<string | undefined> {
		const entries = await this.transcript.listByIssue(issueId)
		return entries.filter(e => e.entryId !== entryId).at(-1)?.entryId
	}

	/**
	 * Mint the (issueId, key, title) the run opens against. A matched decision reuses the open
	 * issue's identity; a new-issue decision mints a fresh id + a thread-unique slug key.
	 */
	private async resolveIssue(
		threadId: string,
		matchedIssueId: string | undefined,
		message: string,
	): Promise<{ issueId: string; key: string; title: string }> {
		const open = await this.openIssues.openIssues(threadId)

		if (matchedIssueId) {
			const ref = open.find(issue => issue.issueId === matchedIssueId)
			if (ref) return { issueId: ref.issueId, key: ref.key, title: ref.title }
			// A matched id that fell out of the open set (raced with completion/archival): treat as new.
		}

		const title = titleFromMessage(message)
		const key = uniqueSlugKey(
			title,
			open.map(issue => issue.key),
		)
		return { issueId: uuidv7(), key, title }
	}
}

/** New-issue title from the inbound message — the first line, clamped (mirrors the classifier fallback). */
function titleFromMessage(message: string): string {
	const firstLine = message.trim().split('\n')[0]?.trim() ?? ''
	return (firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine) || 'New request'
}
