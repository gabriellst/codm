import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codm/core-typescript'
import {
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	type ProviderKind,
} from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '../../repositories/MailboxRepository'
import { NUDGES_BEFORE_STALL, type NudgePayload } from '../../objects/NudgePayload'

/** The two nudges of an episode — the declared count (`NUDGES_BEFORE_STALL`). */
export type NudgeOrdinal = 1 | typeof NUDGES_BEFORE_STALL

/**
 * What each nudge says to the issue's session. The tools are named by purpose: the turn's own prompt
 * (`IssueWorkAgent.declarationInstruction`) names them, and this is a follow-up in that session. Nudge 2 may WORK —
 * always in AUTO, so the permission filter and the regret window hold — and says outright it authorizes nothing
 * irreversible. The supervisor's resume without a stop (`RESTART_WITH_NOTES` on a loop) is the last nudge: nudge 2.
 */
export const NUDGE_TEXT: Readonly<Record<NudgeOrdinal, string>> = {
	1:
		'Your last turn ended without declaring where this issue stands, so nobody can tell whether it is done, ' +
		'waiting on someone, or stuck. Declare it now with the reporting tools, and do not redo any work: ' +
		'finished → mark the issue COMPLETED with a short summary; waiting for a decision or an approval (for ' +
		'example "can I publish?") → ask for the decision; a question you can go on without → ask it with the ' +
		'default you will follow; a preview for people to look at → request feedback on it. ' +
		'Do not write anything for the group — this reminder is not shown to anyone.',
	2:
		'Your last turn ended without declaring where this issue stands, again. If you stopped in the middle of a ' +
		'step, finish that step now; then declare with the reporting tools: finished → mark the issue COMPLETED with ' +
		'a short summary; a decision you need → ask for it; what is missing and from whom → ask the question. ' +
		'This nudge authorizes nothing new: do not publish, deploy, merge or do anything irreversible — if the next ' +
		'step is one of those, ask for the decision instead. Do not write anything for the group — this nudge is not ' +
		'shown to anyone.',
}

/** The task a nudge is for — addressed the way every other steer addresses it. */
export interface NudgeTarget {
	issueId: string
	ownerId: string
	threadId: string
	key: string
	title: string
	provider: ProviderKind
}

/**
 * THE ONE DOOR A NUDGE GOES THROUGH (fase 5) — the reconciler's nudges 1 and 2 and the supervisor's resume of a task
 * with no stop. Narrow on purpose: it can queue a `REMINDER` for an issue in AUTO and ask whether the issue has work
 * coming, and nothing else — so the supervisor has a nudge in reach without the whole queue (an `ISSUE_RESULT` for the
 * orchestrator would be a message to the group by another road).
 *
 * `REMINDER` is WHAT the item is (the column every reader asks); which nudge it is rides the declared payload
 * (`NudgePayloadSchema`), never the dedup key. AUTO posture, always: nobody's grant applies to a nudge.
 */
@injectable()
export class NudgeQueue {
	constructor(private readonly mailbox: MailboxRepository) {}

	/** Queue `nudge` for the task, keyed on `dedupKey` (a repeat queues nothing). @returns whether it was queued. */
	enqueueNudge(
		target: NudgeTarget,
		nudge: NudgePayload['nudge'] & { ordinal: NudgeOrdinal },
		dedupKey: string,
		tx?: Transaction,
	): Promise<boolean> {
		return this.mailbox.enqueue(
			{
				ownerId: target.ownerId,
				targetKind: MailboxTargetKind.ISSUE,
				targetId: target.issueId,
				kind: MailboxItemKind.STEER,
				// A nudge, not somebody's message: never coalesced with steers, never ahead of them.
				claimClass: MailboxClaimClass.REMINDER,
				posture: PermissionPosture.AUTO,
				payload: {
					issueId: target.issueId,
					threadId: target.threadId,
					key: target.key,
					title: target.title,
					provider: target.provider,
					text: NUDGE_TEXT[nudge.ordinal],
					nudge,
				},
				dedupKey,
			},
			tx,
		)
	}

	/** Whether the issue has any work not consumed yet — in flight, deferred for any cause, or waiting its turn. */
	hasWork(issueId: string, tx?: Transaction): Promise<boolean> {
		return this.mailbox.hasPending(MailboxTargetKind.ISSUE, issueId, tx)
	}
}
