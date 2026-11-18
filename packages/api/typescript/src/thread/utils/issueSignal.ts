import type { CommandQueue, Transaction } from '@codm/core-typescript'
import {
	type IssueSignalLevel,
	type Language,
	MessageAuthor,
	type OutputRouting,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import type { Thread, TranscriptEntry } from '../entities/Thread'
import { THREAD_MESSAGES } from '../i18n/messages'
import type { DeliverChannelMessage } from '../usecases/DeliverChannelMessage'
import { routeSignal, SENDS_NOW } from './OutputPolicy'

// Applying the output policy to what an issue says (fase 3) — shared by `DeliverIssueSignal` (an issue's
// spontaneous signal) and `RaiseStop` (a stop's notice), so the routing and the formats are written once.

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
	/** The participant the issue is talking to — named in the message ("quem decide") and the digest's key. */
	addresseeId?: string
	/** The stop (an ask) this message puts to the group — the anchor a quoted reply resolves (slice S3). */
	stopId?: string
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
 * Returns the entry and whether it is sent now; the caller enqueues the delivery (`enqueueSignalDelivery`)
 * in the same transaction. No I/O here.
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
	})
	const entry = thread.recordEntry({
		kind: TranscriptKind.SYSTEM,
		text,
		issueId: draft.issue.issueId,
		level: draft.level,
		routing,
		stopId: draft.stopId,
		addresseeId: draft.addresseeId,
	})
	return { entry, routing, sends: SENDS_NOW[routing] }
}

/**
 * Queue the channel delivery of a signal's entry — `jobId` is the entry id, so a redelivery that already
 * committed never schedules a second send.
 */
export async function enqueueSignalDelivery(
	commands: CommandQueue,
	thread: Thread,
	entry: TranscriptEntry,
	tx: Transaction,
): Promise<void> {
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
}
