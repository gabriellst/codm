import { injectable } from 'tsyringe-neo'
import { CommandQueue, LoggingService, tryCatchAsync } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import type { Thread } from '../../entities/Thread'
import { OPERATOR_PARTICIPANT_ID } from '../../entities/Thread'
import { SteerUrgency } from '../../enums'
import { IssueTurnInterruptRequestedEvent } from '../../events/IssueTurnInterruptRequestedEvent'
import type { ReactToChannelMessage } from '../../usecases/ReactToChannelMessage'
import { CUE_ACKNOWLEDGED } from '../../utils/ChannelCues'
import { parseSteerUrgency } from '../../utils/steerUrgency'
import type { SteerableIssueRef } from '../OpenIssuesReader'
import type { RoutedSteerOrigin } from '../SteerCue'

/** Whether a steer of this urgency cuts the issue's running turn (fase 2, item 4). */
const CUTS_RUNNING_TURN: Readonly<Record<SteerUrgency, boolean>> = {
	[SteerUrgency.NEXT_STEP]: false,
	[SteerUrgency.NOW]: true,
}

/** The channel message a routed steer, or a cue, hangs off — what a reaction is addressed by. */
export interface ChannelMessageRef {
	threadId: string
	senderExternalId: string
	/** The PLATFORM id of the message; absent ⇒ there is nothing to react to and no cue is scheduled. */
	platformMessageId?: string
}

/** One message going straight to an issue's session. */
export interface RoutedSteerInput {
	thread: Thread
	message: ChannelMessageRef & {
		/** The message's transcript entry — the steer's dedup key, and what an "agora" spares. */
		entryId: string
		/** As typed: the mention is stripped and the "agora" read here. */
		text: string
		/** The quoted line's text, when the routing came FROM the quote — the session reads both together. */
		replyingTo?: string
	}
	issue: SteerableIssueRef
}

/**
 * A MESSAGE ROUTED STRAIGHT TO AN ISSUE (fase 2, items 1, 4, 5 and the parallel triage) — the one place
 * that turns it into the issue's STEER, so the rule layer and the triage cannot route two different ways.
 *
 * Extracted from `IngestChannelMessage` when the triage became its second caller. Everything here joins
 * the caller's transaction: the steer item, and the `👀` (best-effort). The "agora" cut is returned as a
 * domain event for the caller (a `Handler`) to save with the rest of its facts — this service has no
 * outbox of its own.
 */
@injectable()
export class RoutedSteer {
	constructor(
		private readonly mailbox: MailboxRepository,
		private readonly commands: CommandQueue,
		private readonly logging: LoggingService,
	) {}

	/** Queue the steer and the `👀`. Returns the "agora" fact when the steer must cut the running turn. */
	async enqueue({ thread, message, issue }: RoutedSteerInput, tx: Transaction): Promise<IssueTurnInterruptRequestedEvent | undefined> {
		const speaker = thread.displayNameOf(message.senderExternalId)
		// "agora" / "now" after the target (fase 2, item 4): cut the running turn so this steer leads the
		// next one. The word itself is taken off what the session is told.
		const steer = parseSteerUrgency(thread.textWithoutMention(message.text))
		const replyingTo = message.replyingTo !== undefined ? `\n(respondendo a: «${message.replyingTo.slice(0, 300)}»)` : ''
		// WHERE IT CAME FROM, so the dispatcher can answer ☑️ / ✅ on this very message (fase 2, item 5).
		// Same gate as the 👀 below: no platform id or reactions off ⇒ no origin ⇒ no cue later either.
		const channelOrigin: RoutedSteerOrigin | undefined =
			message.platformMessageId && thread.reactionsEnabled
				? { ...this.reactionAddress(thread, message, message.platformMessageId), entryId: message.entryId }
				: undefined
		await this.mailbox.enqueue(
			{
				ownerId: thread.ownerId,
				targetKind: MailboxTargetKind.ISSUE,
				targetId: issue.issueId,
				kind: MailboxItemKind.STEER,
				posture: thread.postureOf(message.senderExternalId),
				payload: {
					issueId: issue.issueId,
					threadId: thread.id.value,
					key: issue.key,
					title: issue.title,
					// The PERSON's words, signed by them — never a paraphrase.
					text: `${speaker}: ${steer.text}${replyingTo}`,
					// The steer's own entry — what the turn carrying it registers, so an "agora" never cuts it.
					entryId: message.entryId,
					channelOrigin,
				},
				dedupKey: `steer:${message.entryId}:${issue.issueId}`,
			},
			tx,
		)
		await this.cue(thread, message, message.entryId, CUE_ACKNOWLEDGED, tx)
		// The cut happens AFTER commit, in `InterruptIssueTurnOnSteer` — never inside this transaction.
		return CUTS_RUNNING_TURN[steer.urgency]
			? new IssueTurnInterruptRequestedEvent({
					entityId: thread.id.value,
					ownerId: thread.ownerId,
					payload: { threadId: thread.id.value, issueId: issue.issueId, entryId: message.entryId },
				})
			: undefined
	}

	/**
	 * Schedule a reaction on the message — and REFUSE to let it break the caller (streaming spec, decision 12).
	 *
	 * `CommandQueue.enqueueCommand` is transactional only on the SQLite driver; the broker-backed one does
	 * network I/O that may fail. The caller is an ingest or a triage commit whose loss costs somebody's
	 * message, so the asymmetry is deliberate: no cue is a shrug. Gated per thread (`reactionsEnabled`) and
	 * on a platform id to react to.
	 *
	 * `jobId` is `cue:<entry>` unless a `stage` names a later cue on the same message, so a redelivered
	 * event re-reacts nothing and a later stage is not swallowed by the earlier one's id.
	 */
	async cue(thread: Thread, message: ChannelMessageRef, entryId: string, reaction: string, tx: Transaction, stage?: string): Promise<void> {
		if (!message.platformMessageId || !thread.reactionsEnabled) return
		const outcome = await tryCatchAsync(() =>
			this.commands.enqueueCommand<ReactToChannelMessage>(
				'react_to_channel_message',
				{ ...this.reactionAddress(thread, message, message.platformMessageId ?? ''), reaction },
				{ jobId: stage ? `cue:${entryId}:${stage}` : `cue:${entryId}` },
				tx,
			),
		)
		if (!outcome.success) {
			this.logging.info({
				content: { message: 'cue not scheduled (best-effort)', threadId: message.threadId, reason: outcome.error.message },
			})
		}
	}

	/**
	 * THE MESSAGE KEY A REACTION IS ADDRESSED BY — shared by the `👀` and by the steer's later ☑️ / ✅
	 * (`RoutedSteerOrigin`, fase 2 item 5), so the two can never disagree about which message.
	 */
	reactionAddress(thread: Thread, message: ChannelMessageRef, messageId: string): Omit<ReactToChannelMessage['input'], 'reaction'> {
		// The owner's own words arrive under the OPERATOR roster id (`ConsumeInboundMessage` rewrites the
		// sender when the gateway reports `fromMe`), and WhatsApp addresses a reaction by the whole message
		// key — so the sentinel that already encodes "this account said it" is precisely the fact the
		// gateway needs.
		const fromMe = message.senderExternalId === OPERATOR_PARTICIPANT_ID
		return {
			ownerId: thread.ownerId,
			channelId: thread.channelId,
			remoteId: thread.contactRef.externalId,
			messageId,
			fromMe,
			// THE AUTHOR: in a group `remoteId` is the GROUP jid, so without it the reaction addresses no
			// message. Withheld when `fromMe` — there the id is a sentinel, not a JID.
			senderExternalId: fromMe ? undefined : message.senderExternalId,
		}
	}
}
