import type { GitWorkingState } from '../GitWorktreeProbe'

/** The task a handoff is for — what the turn already has in hand. */
export interface HandoffSubject {
	issueId: string
	threadId: string
	title: string
	/** The cwd the turn runs in — the tree described when the task registered no worktree of its own. */
	cwd: string
}

/**
 * The DURABLE picture of a task (fase 4, item 6a) — everything a fresh session needs that outlives the CLI session:
 * what was asked, what was decided and answered, what is still waiting on someone, what it produced, what it said
 * it did, and where the tree stands. Every list oldest first, already capped.
 */
export interface HandoffDigest {
	title: string
	/** The brief the task was forked with — absent for a task born without one (the console's create). */
	goal?: string
	/** The answers to the task's decisions and questions, as the resumed turn was told them. */
	answers: readonly string[]
	/** What the task asked and nobody answered yet. */
	openQuestions: readonly string[]
	/** The latest messages people sent the task (not the declaration reminder). */
	recentMessages: readonly string[]
	/** What the task recorded — name and reference. */
	artifacts: readonly string[]
	/** What the task said it did, latest last. */
	progress: readonly string[]
	git?: GitWorkingState & { path: string }
}

/** How much of each list the notes carry — enough to keep the thread, small next to the 120k they replace. */
export const HANDOFF_DIGEST_LIMITS = {
	answers: 8,
	openQuestions: 8,
	recentMessages: 3,
	artifacts: 10,
	progress: 5,
	gitChanges: 20,
	/** One item longer than this is cut — a pasted log must not become the whole seed. */
	itemChars: 600,
} as const

/** Cut `text` to `max` characters, marking the cut. */
export function clip(text: string, max: number = HANDOFF_DIGEST_LIMITS.itemChars): string {
	const flat = text.trim()
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** The last `n` of `items` (they are oldest first, so these are the most recent). */
export function lastOf<T>(items: readonly T[], n: number): T[] {
	return items.slice(Math.max(0, items.length - n))
}

/**
 * The digest as the text a fresh session reads — sections with nothing in them are left out, so the session is
 * never told there is something it then cannot find.
 */
export function renderHandoffDigest(digest: HandoffDigest): string {
	const section = (heading: string, items: readonly string[]) => (items.length > 0 ? [heading, ...items.map(i => `  - ${i}`)] : [])
	const git = digest.git
	return [
		`Task: ${digest.title}`,
		...(digest.goal ? ['What was asked:', `  ${digest.goal}`] : []),
		...section('Decisions and answers so far:', digest.answers),
		...section('Still waiting for an answer:', digest.openQuestions),
		...section('Latest messages from people:', digest.recentMessages),
		...section('Recorded artifacts:', digest.artifacts),
		...section('What you reported doing (latest last):', digest.progress),
		...(git
			? [
					`Working tree: ${git.path}${git.branch ? ` on branch ${git.branch}` : ' (detached HEAD)'}`,
					...(git.changes.length > 0 ? ['Uncommitted changes:', ...git.changes.map(c => `  ${c}`)] : ['No uncommitted changes.']),
				]
			: []),
	].join('\n')
}

/**
 * THE DERIVED HANDOFF NOTES (fase 4, item 6a) — the durable state of a task, rendered for the fresh session a turn
 * opens once the old one is past the context budget (`RunIssueTurn`). Always part of the seed: with the session's
 * own notes it is the safety net (the goal, the open decision and the people's messages are never lost to what the
 * session chose to write), without them it is all there is (`HandoffNotesSource.DERIVED`).
 *
 * A read service over the agent's own facts and queue plus the declared read surfaces (`ThreadRepository`,
 * `ArtifactRepository`, `GitWorktreeProbe`) — never a write, never a tool.
 */
export abstract class HandoffNotes {
	abstract digest(subject: HandoffSubject): Promise<HandoffDigest>

	async derive(subject: HandoffSubject): Promise<string> {
		return renderHandoffDigest(await this.digest(subject))
	}
}
