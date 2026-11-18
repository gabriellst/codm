import type { CommandQueue, Transaction } from '@codm/core-typescript'
import { type IssueSignalLevel, type Language, MessageAuthor, OutputRouting, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import type { Thread, TranscriptEntry } from '../entities/Thread'
import { THREAD_MESSAGES } from '../i18n/messages'
import type { DeliverChannelMessage } from '../usecases/DeliverChannelMessage'
import type { DeliverIssuePreview } from '../usecases/DeliverIssuePreview'
import type { FlushSignalDigest } from '../usecases/FlushSignalDigest'
import { DIGEST_WINDOW_MS, routeSignal, SENDS_NOW } from './OutputPolicy'

// Applying the output policy to what an issue says (fase 3) — shared by `DeliverIssueSignal` (an issue's
// spontaneous signal), `RaiseStop` (a stop's notice) and `FlushSignalDigest` (a person's digest), so the
// routing, the formats and the way each routing reaches the channel are written once.

/**
 * What an issue says, before the policy decides where it goes — the structured parts the format of its
 * level picks from (`THREAD_MESSAGES.issueSignal`).
 */
export interface IssueSignalDraft {
	issue: { issueId: string; key: string; title: string }
	level: IssueSignalLevel
	text: string
	/** The heading of a notice or a closing — the issue's title when absent. */
	title?: string
	/** The ask's code (`APP-12 · D1`), its options' labels and, for a question, what it goes on with. */
	code?: string
	options?: readonly string[]
	defaultLabel?: string
	/** The participant the issue DECLARED it is talking to — named in the message ("quem decide"). */
	addresseeId?: string
	/**
	 * Who wrote the message the issue came from — the person a signal with no declared addressee is for, i.e.
	 * the key of its per-person digest. Never named in the message: only a declared addressee is.
	 */
	requesterId?: string
	/** The stop (an ask) this message puts to the group — the anchor a quoted reply resolves (slice S3). */
	stopId?: string
	/** The artifact a FEEDBACK previews — sent with the message when it goes out alone. */
	artifactId?: string
	/** How many other artifacts the FEEDBACK cites (they stay on the console until the panel has a gallery). */
	moreArtifacts?: number
	/** The cause of this notice is already told in the group (`causeAlreadyTold`) — it goes to the panel only. */
	alreadyTold?: boolean
}

/** Where the issue's link goes: the group's panel page, opened at the issue. Absent without a cloud login. */
export function issueLink(panelLink: string | undefined, key: string): string | undefined {
	return panelLink ? `${panelLink}#${key}` : undefined
}

/**
 * Record what an issue says on the conversation it belongs to, routed by the group's mode — on an
 * aggregate the CALLER holds and will save, so the entry commits with whatever the caller writes beside it
 * (`RaiseStop` records it before raising the stop, so the stop can point at the message that asked).
 *
 * Returns the entry, its routing and whether it is sent now; the caller hands it to the channel
 * (`enqueueSignalDelivery`) in the same transaction. No I/O here.
 */
export function recordIssueSignal(
	thread: Thread,
	draft: IssueSignalDraft,
	context: { language: Language; panelLink?: string },
): { entry: TranscriptEntry; routing: OutputRouting; sends: boolean } {
	const routing = routeSignal(thread.outputMode, draft.level, draft.alreadyTold)
	const text = THREAD_MESSAGES.issueSignal(context.language, {
		level: draft.level,
		key: draft.issue.key,
		code: draft.code,
		title: draft.title ?? draft.issue.title,
		text: draft.text,
		options: draft.options ?? [],
		defaultLabel: draft.defaultLabel,
		// A roster NAME or nothing — never the raw address `displayNameOf` would fall back to.
		decider: draft.addresseeId ? thread.rosterNameOf(draft.addresseeId) : undefined,
		link: issueLink(context.panelLink, draft.issue.key),
		moreArtifacts: draft.moreArtifacts,
	})
	const entry = thread.recordEntry({
		kind: TranscriptKind.SYSTEM,
		text,
		issueId: draft.issue.issueId,
		level: draft.level,
		routing,
		stopId: draft.stopId,
		artifactId: draft.artifactId,
		// The person, resolved ONCE, here: the digest groups by this column.
		addresseeId: draft.addresseeId ?? draft.requesterId,
	})
	return { entry, routing, sends: SENDS_NOW[routing] }
}

/**
 * The window a signal recorded at `at` falls in — the `<janela>` of the digest's job id. Every signal of a
 * window is recorded before the window ends, and the first one schedules the flush a whole window later,
 * so the flush always runs after the last of them: one job per person per window, never one too early.
 */
export function digestWindowOf(at: Date): number {
	return Math.floor(at.getTime() / DIGEST_WINDOW_MS)
}

type Dispatch = (commands: CommandQueue, thread: Thread, entry: TranscriptEntry, tx: Transaction) => Promise<void>

/**
 * How each routing reaches the channel — total over `OutputRouting`, so a routing added to the contract needs
 * its way out here:
 * - `GROUP` — its own message, now: the text, or the preview with the text as its caption when the entry
 *   carries an artifact (a FEEDBACK — `DeliverIssuePreview` reads and stages the file);
 * - `DIGEST` — the flush of its person's window, a window later (`jobId` dedups the window);
 * - `PANEL` — nothing: the entry is the timeline line.
 */
const DISPATCH: Record<OutputRouting, Dispatch> = {
	[OutputRouting.GROUP]: async (commands, thread, entry, tx) => {
		if (entry.artifactId) {
			await commands.enqueueCommand<DeliverIssuePreview>(
				'deliver_issue_preview',
				{ ownerId: thread.ownerId, threadId: thread.id.value, entryId: entry.entryId },
				{ jobId: `preview:${entry.entryId}` },
				tx,
			)
			return
		}
		await commands.enqueueCommand<DeliverChannelMessage>(
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
	},
	[OutputRouting.DIGEST]: async (commands, thread, entry, tx) => {
		await commands.enqueueCommand<FlushSignalDigest>(
			'flush_signal_digest',
			{ ownerId: thread.ownerId, threadId: thread.id.value, addresseeId: entry.addresseeId },
			{ jobId: `digest:${thread.id.value}:${entry.addresseeId ?? '-'}:${digestWindowOf(entry.at)}`, delay: DIGEST_WINDOW_MS },
			tx,
		)
	},
	// The entry IS the timeline line — nothing goes to the channel.
	[OutputRouting.PANEL]: () => Promise.resolve(),
}

/**
 * Hand a signal's entry to the channel the way its routing says (`DISPATCH`) — in the caller's transaction,
 * so a signal that commits always goes out, and one that fails never leaves a message behind. `jobId`s are
 * the entry's (or the window's), so a redelivery that already committed never schedules a second send.
 */
export async function enqueueSignalDelivery(
	commands: CommandQueue,
	thread: Thread,
	entry: TranscriptEntry,
	routing: OutputRouting,
	tx: Transaction,
): Promise<void> {
	await DISPATCH[routing](commands, thread, entry, tx)
}
