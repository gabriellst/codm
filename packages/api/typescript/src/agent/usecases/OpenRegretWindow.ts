import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IrreversibleActionKind, RegretWindowOutcome } from '@codm/contracts-typescript/wire/enums'
import { IssueHold } from '@issue/services/IssueHold'
import { MailboxRepository } from '../repositories/MailboxRepository'
import { RegretWindowClock } from '../services/RegretWindowClock'
import { RegretWindowClosedEvent } from '../events/RegretWindowClosedEvent'
import { matchIrreversibleAction, REGRET_WINDOW_MS } from '../utils/irreversibleActions'

export const OpenRegretWindowInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	/** The issue whose session is about to act — from the run's identity, never from the model. */
	issueId: z.uuid(),
	/** The shell command the session is about to run, as the CLI reports it. Judged here, never stored. */
	command: z.string(),
})

/** Absent = not an irreversible action: no window opened, nothing recorded, the command runs now. */
export const OpenRegretWindowOutputSchema = z
	.object({
		actionKind: z.enum(IrreversibleActionKind),
		outcome: z.enum(RegretWindowOutcome),
		waitedMs: z.number().int().nonnegative(),
	})
	.optional()

/**
 * OpenRegretWindow — "espera alguns segundos e confere a caixa de recados" (fase 2, item 3).
 *
 * Called by the session's own pre-tool hook (`PreToolHookController`) before every shell command of an
 * issue run. Most commands are not irreversible and return at once. One that is (`IRREVERSIBLE_ACTIONS`):
 *  1. checked AT ONCE — the issue already paused, or guidance it has not read (a correction queued while
 *     the turn was busy) ⇒ cancelled without waiting;
 *  2. otherwise held for `REGRET_WINDOW_MS`, then checked again — a message or a pause that arrived in
 *     those seconds cancels it; nothing new ⇒ it goes ahead.
 * Either way the window is recorded (`agent.regret_window_closed`) for the issue's timeline.
 *
 * A cancel does NOT touch the steer: it stays in the mailbox and is read the usual way, at the issue's
 * next turn (or now, if it said `agora` — item 4). The refusal only makes the session stop and look.
 *
 * Pause before steer: a held issue is the stronger statement ("pare"), and its timeline should say so.
 */
@injectable()
export class OpenRegretWindow extends Handler<typeof OpenRegretWindowInputSchema, typeof OpenRegretWindowOutputSchema> {
	readonly name = 'open_regret_window' as const
	readonly inputSchema = OpenRegretWindowInputSchema
	readonly outputSchema = OpenRegretWindowOutputSchema

	constructor(
		private readonly hold: IssueHold,
		private readonly mailbox: MailboxRepository,
		private readonly clock: RegretWindowClock,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const actionKind = matchIrreversibleAction(input.command)
		if (actionKind === undefined) return undefined

		let waitedMs = 0
		let outcome = await this.cancellation(input.issueId, tx)
		if (outcome === undefined) {
			await this.clock.wait(REGRET_WINDOW_MS)
			waitedMs = REGRET_WINDOW_MS
			outcome = (await this.cancellation(input.issueId, tx)) ?? RegretWindowOutcome.PROCEEDED
		}

		const closed = { actionKind, outcome, waitedMs }
		await this.withTransaction(tx, async tx => {
			await this.domainEventRepository.save(
				new RegretWindowClosedEvent({
					entityId: input.issueId,
					ownerId: input.ownerId,
					payload: { issueId: input.issueId, threadId: input.threadId, ...closed },
				}),
				tx,
			)
		})
		return closed
	}

	/** Why the action must not run now — `undefined` when nothing stands in its way. */
	private async cancellation(issueId: string, tx?: Transaction): Promise<RegretWindowOutcome | undefined> {
		if (await this.hold.isHeld(issueId, tx)) return RegretWindowOutcome.CANCELLED_BY_PAUSE
		if (await this.mailbox.hasUnreadSteer(issueId, tx)) return RegretWindowOutcome.CANCELLED_BY_STEER
		return undefined
	}
}
