import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { ClassificationMethod, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { InboundTriage, TRIAGE_HOLDER, type InboundTriageRequest, type TriageVerdict } from '@agent/services/InboundTriage'
import { TriageDecision } from '@agent/enums'
import { WorkspaceRepository } from '@workspace/repositories/WorkspaceRepository'
import type { Thread, TranscriptEntry } from '../entities/Thread'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { OpenIssuesReader } from '../services/OpenIssuesReader'
import { RoutedSteer } from '../services/RoutedSteer'
import { MessageTriagedEvent } from '../events/MessageTriagedEvent'
import { AGENT_SPEAKER } from '../objects'
import { CUE_READ } from '../utils/ChannelCues'

/** How many lines said BEFORE the message the triage sees — intent, not history. */
export const TRIAGE_CONTEXT_LINES = 6

/** What a participant with no roster name is called in the triage prompt — never their address. */
const UNNAMED_SPEAKER = 'participante'

/** The transcript kinds that are CONVERSATION: what somebody said in the room, and what the agent said. */
const CONTEXT_KINDS: ReadonlySet<TranscriptKind> = new Set([TranscriptKind.CONTACT, TranscriptKind.SYSTEM])

export const TriageChannelMessageInputSchema = z.object({
	threadId: z.uuid(),
	/** The message's transcript entry — also the `dedupKey` of its held orchestrator item. */
	entryId: z.uuid(),
	/** The platform id, for the cues (👀 / ✅); absent ⇒ no cue, exactly as at ingest. */
	platformMessageId: z.string().optional(),
})

export const TriageChannelMessageOutputSchema = z.object({
	decision: z.enum(TriageDecision),
	/** False when the hold was gone before the verdict landed — the orchestrator answers, nothing changed here. */
	applied: z.boolean(),
})

/**
 * THE PARALLEL TRIAGE OF ONE MESSAGE (fase 2, `.specs/2026-11-16-falar-e-parar-na-hora-design.md`).
 *
 * `IngestChannelMessage` recorded the message and queued the orchestrator's item HELD (`TRIAGE_HOLDER`).
 * This use case asks `InboundTriage` where it goes — OUTSIDE any transaction, the model run takes seconds —
 * then settles the hold in ONE transaction:
 *
 *  - `STEER` to an issue that is WORKING → the hold is CONSUMED (no orchestrator turn), the entry is
 *    linked to the issue (`CONTEXT_MATCH`), and the message becomes the issue's STEER through the same
 *    `RoutedSteer` the rule layer uses (👀, ☑️/✅, "agora").
 *  - `NO_ACTION` → consumed; the message gets ✅ ("seen, nothing to do") in place of the 👀.
 *  - anything else → RELEASED to the orchestrator now, with the verdict patched into the item as a hint.
 *
 * The settle is a compare-and-swap on the holder: a verdict that arrives after the hold lapsed (and the
 * orchestrator claimed the item) changes nothing. Every exit records `thread.message_triaged`.
 */
@injectable()
export class TriageChannelMessage extends Handler<typeof TriageChannelMessageInputSchema, typeof TriageChannelMessageOutputSchema> {
	readonly name = 'triage_channel_message' as const
	readonly inputSchema = TriageChannelMessageInputSchema
	readonly outputSchema = TriageChannelMessageOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly mailbox: MailboxRepository,
		private readonly triage: InboundTriage,
		private readonly issues: OpenIssuesReader,
		private readonly workspaces: WorkspaceRepository,
		private readonly routedSteer: RoutedSteer,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// Nothing to decide unless the item is still ours — a hold that lapsed before this ran (a long queue,
		// a slow boot) is already the orchestrator's, and a model run would be spent for nothing.
		if (!(await this.mailbox.isHeld(input.entryId, TRIAGE_HOLDER, tx))) {
			return { decision: TriageDecision.ORCHESTRATOR, applied: false }
		}

		const request = await this.buildRequest(input, tx)
		const verdict: TriageVerdict = request
			? await this.triage.decide(request)
			: { decision: TriageDecision.ORCHESTRATOR, confidence: undefined, latencyMs: 0, fallback: 'nothing to triage with' }

		return this.withTransaction(tx, tx => this.settle(input, verdict, tx))
	}

	/** What the triage is handed — `undefined` when the conversation cannot be triaged (no workspace, no provider). */
	private async buildRequest(input: this['input'], tx?: Transaction): Promise<InboundTriageRequest | undefined> {
		const thread = await this.threads.findById(input.threadId, tx)
		const entry = await this.threads.findEntry(input.entryId, tx)
		if (!thread || thread.deletedAt || !entry || entry.threadId !== thread.id.value) return undefined
		const provider = thread.providers[0]
		const workspace = await this.workspaces.findById(thread.workspaceId)
		if (!provider || !workspace) return undefined

		const quoted = entry.quotedEntryId ? await this.threads.findEntry(entry.quotedEntryId, tx) : undefined
		// The tail BEFORE the message: conversation lines only, the message itself excluded, capped.
		const recent = (await this.threads.recentEntries(thread.id.value, TRIAGE_CONTEXT_LINES + 1, tx))
			.filter(row => row.entryId !== entry.entryId && CONTEXT_KINDS.has(row.kind))
			.slice(-TRIAGE_CONTEXT_LINES)

		return {
			ownerId: thread.ownerId,
			threadId: thread.id.value,
			provider,
			cwd: workspace.path,
			message: {
				speaker: this.speakerOf(thread, entry),
				text: thread.textWithoutMention(entry.text),
				quoted: quoted ? { speaker: this.speakerOf(thread, quoted), text: quoted.text } : undefined,
			},
			openIssues: (await this.issues.openIssues(thread.id.value)).map(issue => ({
				key: issue.key,
				title: issue.title,
				status: issue.status,
				lastActivityAt: issue.lastActivityAt,
			})),
			recent: recent.map(row => ({ speaker: this.speakerOf(thread, row), text: row.text, at: row.at })),
			now: new Date(),
		}
	}

	/** A NAME for the prompt — the roster's, `you` for the agent, a neutral label otherwise. Never an address. */
	private speakerOf(thread: Thread, row: Pick<TranscriptEntry, 'kind' | 'senderExternalId'>): string {
		if (row.kind === TranscriptKind.SYSTEM) return AGENT_SPEAKER
		return thread.rosterNameOf(row.senderExternalId) ?? UNNAMED_SPEAKER
	}

	/** Does this message reply to the agent, or land while the conversation has an open question? */
	private async mayBeAnAnswer(threadId: string, entry: TranscriptEntry, tx: Transaction): Promise<boolean> {
		const quoted = entry.quotedEntryId ? await this.threads.findEntry(entry.quotedEntryId, tx) : undefined
		if (quoted?.kind === TranscriptKind.SYSTEM) return true
		return (await this.threads.openStops(threadId, tx)).length > 0
	}

	private async settle(input: this['input'], verdict: TriageVerdict, tx: Transaction): Promise<this['output']> {
		// Read INSIDE the transaction: the model run took seconds, and the aggregate saved below must be the
		// one as it stands now, not the one loaded before the run.
		const thread = await this.threads.findById(input.threadId, tx)
		const entry = await this.threads.findEntry(input.entryId, tx)

		const record = async (decision: TriageDecision, applied: boolean, extra: { fallback?: string; issueId?: string } = {}) => {
			if (thread) {
				await this.domainEventRepository.save(
					new MessageTriagedEvent({
						entityId: input.threadId,
						ownerId: thread.ownerId,
						payload: {
							threadId: input.threadId,
							entryId: input.entryId,
							decision,
							confidence: verdict.confidence,
							latencyMs: Math.max(0, Math.round(verdict.latencyMs)),
							fallback: extra.fallback ?? verdict.fallback,
							applied,
							issueId: extra.issueId,
						},
					}),
					tx,
				)
			}
			return { decision, applied }
		}

		const toOrchestrator = async (decision: TriageDecision, fallback?: string) => {
			const applied = await this.mailbox.settleHold(
				input.entryId,
				TRIAGE_HOLDER,
				{
					consume: false,
					// THE HINT: the orchestrator reads the verdict instead of re-deriving it (a NEW_TASK's title).
					merge: {
						triage: {
							decision,
							confidence: verdict.confidence,
							...(verdict.decision === TriageDecision.NEW_TASK && { title: verdict.title }),
						},
					},
				},
				tx,
			)
			return record(decision, applied, { fallback })
		}
		if (!thread || !entry) return toOrchestrator(TriageDecision.ORCHESTRATOR, 'message no longer there')

		// An entry the ingest already tied to an issue is never re-routed (the ingest does not hold those;
		// this is the floor for any other path that would).
		if (entry.issueId) return toOrchestrator(TriageDecision.ORCHESTRATOR, 'entry already tied to an issue')

		const message = { threadId: input.threadId, senderExternalId: entry.senderExternalId ?? '', platformMessageId: input.platformMessageId }

		switch (verdict.decision) {
			case TriageDecision.STEER: {
				// The model names a KEY; whether that key is a steerable issue of THIS conversation is checked
				// here, against the same reader the rule layer uses — and only a WORKING one is steered, exactly
				// like the rule layer (reopening is the orchestrator's decision).
				const issue = await this.issues.steerableIssueByKey(thread.id.value, verdict.issueKey, tx)
				if (!issue || issue.needsReopen) return toOrchestrator(TriageDecision.ORCHESTRATOR, `issue ${verdict.issueKey} not steerable`)
				if (!(await this.mailbox.settleHold(input.entryId, TRIAGE_HOLDER, { consume: true }, tx))) {
					return record(TriageDecision.STEER, false, { issueId: issue.issueId })
				}
				thread.linkEntryToIssue(entry, issue.issueId, ClassificationMethod.CONTEXT_MATCH)
				await this.threads.save(thread, tx)
				const interrupt = await this.routedSteer.enqueue(
					{ thread, message: { ...message, entryId: entry.entryId, text: entry.text }, issue },
					tx,
				)
				if (interrupt) await this.domainEventRepository.save(interrupt, tx)
				return record(TriageDecision.STEER, true, { issueId: issue.issueId })
			}
			case TriageDecision.NO_ACTION: {
				// "ok" / "pode" are thanks in one place and an APPROVAL in another. Never "nothing to do" for a
				// message that replies to the agent, or while the conversation has a question open (a stop) — an
				// answer swallowed there is somebody waiting forever. Decided here, not by the prompt.
				if (await this.mayBeAnAnswer(thread.id.value, entry, tx)) {
					return toOrchestrator(TriageDecision.ORCHESTRATOR, 'NO_ACTION on a possible answer')
				}
				if (!(await this.mailbox.settleHold(input.entryId, TRIAGE_HOLDER, { consume: true }, tx))) {
					return record(TriageDecision.NO_ACTION, false)
				}
				// The 👀 said "I saw it and I am on it"; no turn follows, so it is replaced by ✅ — "seen, nothing to do".
				await this.routedSteer.cue(thread, message, entry.entryId, CUE_READ, tx, 'triage')
				return record(TriageDecision.NO_ACTION, true)
			}
			case TriageDecision.NEW_TASK:
			case TriageDecision.ORCHESTRATOR:
				return toOrchestrator(verdict.decision)
			default: {
				const unreachable: never = verdict
				return unreachable
			}
		}
	}
}
