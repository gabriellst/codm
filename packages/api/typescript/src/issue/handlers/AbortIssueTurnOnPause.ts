import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codm/core-typescript'
import { IssueTurnAborter } from '@agent/services/IssueTurnAborter'
import { IssueRepository } from '../repositories/IssueRepository'
import { IssuePausedEvent } from '../events/IssuePausedEvent'

/**
 * `issue.paused` → kill the issue's running turn, if one is running (fase 2, item 2 — vale na hora).
 *
 * The `paused` flag already holds everything that has not started — the dispatcher defers, the tool
 * doors refuse. What the flag cannot reach is a CLI already mid-turn: this is the leg that does.
 *
 * RE-READS the issue before aborting. The fact is delivered at least once and may arrive late; a
 * "pare" followed quickly by "continue" must not kill the turn the resume just let start.
 *
 * Writing into the agent context's runtime from here is the shape `thread/handlers/ResumeIssueOnStopResolved`
 * already uses for the mailbox: the fact belongs to `issue`, so its handler lives here, and it commands
 * the agent's turn control through a declared `consumes` edge (agent ↔ issue, annotated partnership).
 */
@injectable()
export class AbortIssueTurnOnPause extends EventHandler<typeof IssuePausedEvent> {
	readonly event = IssuePausedEvent

	constructor(
		private readonly issues: IssueRepository,
		private readonly aborter: IssueTurnAborter,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const issue = await this.issues.findById(event.payload.issueId)
		if (!issue?.paused) return
		this.aborter.abort(issue.id.value)
	}
}
