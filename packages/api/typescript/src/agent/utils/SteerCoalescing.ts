import { z } from '@codm/core-typescript'
import { MailboxClaimClass, type PermissionPosture } from '@codm/contracts-typescript/wire/enums'

/**
 * How many items one turn may carry (fase 4, item 6b) — the head and up to nine followers. A bound, so a burst of
 * messages to one task cannot become one prompt nobody can act on.
 */
export const MAX_COALESCED = 10

/**
 * Which classes may LEAD a group of steers — what the claim takes as a turn's head and then looks behind (fase 4,
 * item 6b). Total over the enum. Only guidance leads: an ordinary `STEER`, or the "agora" (`INTERRUPT`), which leads
 * the next turn anyway. Never the task's first turn (`WORK`: the brief is its own turn), never the answer to a decision
 * (`DECISION_ANSWER`: the publish command runs in its place, S11), never the declaration reminder (`REMINDER`: its
 * reply is withheld from the group — a person's steer riding with it would go unanswered), and never a conversation's
 * item (`RESULT`, `OPERATOR`: the orchestrator's lane does not coalesce).
 */
export const LEADS_STEER_GROUP: Readonly<Record<MailboxClaimClass, boolean>> = {
	[MailboxClaimClass.DECISION_ANSWER]: false,
	[MailboxClaimClass.INTERRUPT]: true,
	[MailboxClaimClass.STEER]: true,
	[MailboxClaimClass.WORK]: false,
	[MailboxClaimClass.REMINDER]: false,
	[MailboxClaimClass.RESULT]: false,
	[MailboxClaimClass.OPERATOR]: false,
}

/**
 * Which classes may RIDE behind a head — only an ordinary `STEER`. An "agora", a decision's answer, a reminder STOP the
 * prefix: they are never skipped, so no newer steer ever passes an older item of its own task. Total over the enum.
 */
export const JOINS_STEER_GROUP: Readonly<Record<MailboxClaimClass, boolean>> = {
	[MailboxClaimClass.DECISION_ANSWER]: false,
	[MailboxClaimClass.INTERRUPT]: false,
	[MailboxClaimClass.STEER]: true,
	[MailboxClaimClass.WORK]: false,
	[MailboxClaimClass.REMINDER]: false,
	[MailboxClaimClass.RESULT]: false,
	[MailboxClaimClass.OPERATOR]: false,
}

/** The loop a steer was fired by (`firedByLoop` on its payload, written by `SteerThread`) — absent for a person's. */
const LoopPayloadSchema = z.object({ firedByLoop: z.string().min(1) })
const loopOf = (payload: unknown): string | undefined => {
	const parsed = LoopPayloadSchema.safeParse(payload)
	return parsed.success ? parsed.data.firedByLoop : undefined
}

/** What the claim knows about a queued item when it decides who rides along. */
export interface CoalescingCandidate {
	claimClass: MailboxClaimClass
	posture: PermissionPosture
	payload: unknown
}

/**
 * THE CONTIGUOUS PREFIX that rides with `head` (fase 4, item 6b) — `next` are the target's following runnable items in
 * arrival order. A follower is a `STEER` with the head's POSTURE (posture is privilege: a steer from someone who cannot
 * release never travels with one from someone who can) and the head's LOOP ORIGIN (the turn speaks as one author: a
 * loop's nudge and a person's message are never one turn). The prefix STOPS at the first item that does not fit —
 * never skips it — and at `MAX_COALESCED` items in all. A head whose class does not lead carries nobody.
 *
 * @returns how many of `next` ride along (a prefix length).
 */
export function coalescedPrefix(head: CoalescingCandidate, next: readonly CoalescingCandidate[]): number {
	if (!LEADS_STEER_GROUP[head.claimClass]) return 0
	const headLoop = loopOf(head.payload)
	let riding = 0
	for (const item of next) {
		if (riding >= MAX_COALESCED - 1) break
		if (!JOINS_STEER_GROUP[item.claimClass] || item.posture !== head.posture || loopOf(item.payload) !== headLoop) break
		riding += 1
	}
	return riding
}
