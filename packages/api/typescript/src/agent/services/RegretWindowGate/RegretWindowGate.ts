import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codm/core-typescript'
import { RegretWindowOutcome } from '@codm/contracts-typescript/wire/enums'
import { IssueHold } from '@issue/services/IssueHold'
import { MailboxRepository } from '../../repositories/MailboxRepository'
import { RegretWindowClock } from '../RegretWindowClock'
import { REGRET_WINDOW_MS } from '../../utils/irreversibleActions'

/** How a window closed: what decided it, and how long the action was held (0 = cancelled before waiting). */
export interface RegretWindowVerdict {
	outcome: RegretWindowOutcome
	waitedMs: number
}

/**
 * THE REGRET WINDOW'S RULE (fase 2, item 3) — ONE place, two callers: the session's pre-tool hook before an
 * irreversible shell command (`OpenRegretWindow`) and the workspace's publish command (fase 4, item 6c,
 * `RunPublishCommand`). Never duplicated:
 *  1. checked AT ONCE — the issue already paused, or guidance it has not read ⇒ cancelled without waiting;
 *  2. otherwise held for `REGRET_WINDOW_MS` (`RegretWindowClock`, so a test never sleeps), then checked again —
 *     a message or a pause that arrived in those seconds cancels; nothing new ⇒ `PROCEEDED`.
 *
 * Pause before steer: a held issue is the stronger statement ("pare"). The item a running turn holds is not an
 * unread steer (`hasUnreadSteer` skips claimed rows) — so the publish trigger never cancels itself.
 */
@injectable()
export class RegretWindowGate {
	constructor(
		private readonly hold: IssueHold,
		private readonly mailbox: MailboxRepository,
		private readonly clock: RegretWindowClock,
	) {}

	async window(issueId: string, tx?: Transaction): Promise<RegretWindowVerdict> {
		const now = await this.cancellation(issueId, tx)
		if (now !== undefined) return { outcome: now, waitedMs: 0 }
		await this.clock.wait(REGRET_WINDOW_MS)
		return { outcome: (await this.cancellation(issueId, tx)) ?? RegretWindowOutcome.PROCEEDED, waitedMs: REGRET_WINDOW_MS }
	}

	/** Why the action must not run now — `undefined` when nothing stands in its way. */
	private async cancellation(issueId: string, tx?: Transaction): Promise<RegretWindowOutcome | undefined> {
		if (await this.hold.isHeld(issueId, tx)) return RegretWindowOutcome.CANCELLED_BY_PAUSE
		if (await this.mailbox.hasUnreadSteer(issueId, tx)) return RegretWindowOutcome.CANCELLED_BY_STEER
		return undefined
	}
}
