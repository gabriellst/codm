import { injectable } from 'tsyringe-neo'
import { LoggingService } from '@codm/core-typescript'
import { RecordIssueWorktree } from '../../usecases/RecordIssueWorktree'

/** One `cwd` an issue's session declared on a hook call. */
export interface WorktreeSighting {
	issueId: string
	threadId: string
	cwd: string
}

/** How many (issue, cwd) pairs are remembered before the memory starts over — a bound, not a cache policy. */
const SIGHTINGS_REMEMBERED_MAX = 2_000

/**
 * THE HOOK'S WORKTREE SIGHTINGS (fase 4, item 1 — revisão 2) — what keeps the registration OFF the hook's response.
 *
 * The provider CLI waits for the `PreToolUse` hook's answer before it runs the command, so nothing the
 * registration does (two git calls, a write) may sit on that path. `schedule` returns at once: the work starts on a
 * later tick, after the controller has answered, and its failure is a log line — never the hook's answer.
 *
 * A `cwd` already seen for the issue is not even scheduled: a session runs dozens of commands in the same place.
 * IN MEMORY, one instance per process — a restart forgets and re-registers the same path once, which is harmless
 * (`recordWorktree` overwrites with the same value).
 */
@injectable()
export class WorktreeSightings {
	private readonly seen = new Set<string>()

	constructor(
		private readonly record: RecordIssueWorktree,
		private readonly logging: LoggingService,
	) {}

	/**
	 * Schedule the registration of `sighting`, never awaiting it.
	 * @returns the scheduled work (tests await it to observe the outcome); `undefined` when the pair was already seen.
	 */
	schedule(sighting: WorktreeSighting): Promise<void> | undefined {
		const key = `${sighting.issueId}\u0000${sighting.cwd}`
		if (this.seen.has(key)) return undefined
		if (this.seen.size >= SIGHTINGS_REMEMBERED_MAX) this.seen.clear()
		this.seen.add(key)
		const seenAt = new Date()
		return new Promise<void>(resolve => setTimeout(resolve, 0))
			.then(() => this.record.execute({ ...sighting, seenAt }))
			.then(
				() => undefined,
				(error: unknown) => {
					// Unknown outcome ⇒ forget the pair, so a later command of the session tries again.
					this.seen.delete(key)
					this.logging.warn({
						content: {
							message: 'worktree registration failed — nothing registered',
							issueId: sighting.issueId,
							reason: error instanceof Error ? error.message : String(error),
						},
					})
				},
			)
	}
}
