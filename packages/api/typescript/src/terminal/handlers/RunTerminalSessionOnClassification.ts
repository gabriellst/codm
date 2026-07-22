import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { EventHandler } from '@codedm/core-typescript'
import { MessageClassifiedEvent } from '@codedm/contracts-typescript/wire/events'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { TranscriptRepository } from '@thread/repositories/TranscriptRepository'
import { OpenIssuesReader } from '@thread/services/OpenIssuesReader'
import { WorkspaceRepository } from '@workspace/repositories'
import { RunTerminalSession } from '../usecases/RunTerminalSession'
import { uniqueSlugKey } from '../services/IssueClassifier'

/**
 * The severed-saga closer (phase-6b). BC4 Thread & Routing demultiplexes an inbound message into an
 * issue and publishes the FROZEN `integration.message.classified`; THIS is the terminal engine's
 * trigger — the one runtime caller of `RunTerminalSession`. Consuming the fact here (never in a use
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
 * `RunTerminalSession` then runs the (stubbed-in-tests) runner and persists context-private
 * `terminal.*` facts; the existing `PublishTerminalIntegrationEvents` bridge republishes them so
 * `integration.issue.opened` / `agent.reply_drafted` / `issue.completed` / `issue.stop_raised` fire
 * live — and `MaterializeIssueFromExecution` materializes the Issue row from `issue.opened`.
 *
 * Defensive drops (no throw): a fact for an unresolvable thread/entry/workspace is a no-op — the
 * same "drop the unroutable inbound" posture BC4's `ConsumeInboundMessage` takes.
 */
@injectable()
export class RunTerminalSessionOnClassification extends EventHandler<typeof MessageClassifiedEvent> {
	readonly event = MessageClassifiedEvent

	constructor(
		private readonly threads: ThreadRepository,
		private readonly workspaces: WorkspaceRepository,
		private readonly transcript: TranscriptRepository,
		private readonly openIssues: OpenIssuesReader,
		private readonly runTerminalSession: RunTerminalSession,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''
		const { threadId, entryId, issueId } = event.payload

		const thread = await this.threads.findById(threadId)
		if (!thread) return

		const entry = await this.transcript.findById(entryId)
		if (!entry) return

		const workspace = await this.workspaces.findById(thread.workspaceId)
		if (!workspace) return

		const provider = thread.providers[0]
		if (!provider) return

		const resolved = await this.resolveIssue(threadId, issueId, entry.text)

		await this.runTerminalSession.execute({
			ownerId,
			issueId: resolved.issueId,
			threadId,
			key: resolved.key,
			title: resolved.title,
			provider,
			workspacePath: workspace.path,
			prompt: entry.text,
		})
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
