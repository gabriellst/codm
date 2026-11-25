import { ISSUE_KEY_FALLBACK, slugify } from '@shared/utils/slug'

/**
 * THE TASK'S KEY IS ITS NAME (voz do grupo, 25/11): `<slug do nome>-<n>` — `video-na-landing-19`, where it used to
 * be `BDA-19`. The group asked to read what a task is about instead of a code; the number is the per-workspace
 * sequence the key already drew (`IssueSequence`), so the key stays UNIQUE BY CONSTRUCTION.
 *
 * Why the number stays: the key is minted HERE, in `agent`, but the issue row (and its `(thread, key)` unique
 * index) is materialised later, off the outbox. A batch forks several tasks in one turn; two with the same name
 * would both find the name free and the second row would never materialise. The sequence closes that race with
 * no extra read — and keeps the old number, so `BDA-19` and `video-na-landing-19` are visibly the same counter.
 */

/** The most the name contributes to the key — about three short words. */
export const ISSUE_NAME_SLUG_MAX = 24

/** How many words of the title name a task when the orchestrator gave no name. */
const DEFAULT_NAME_WORDS = 3

/** The key of a task named `name`, drawn `seq` from its workspace's sequence. */
export function issueKeyOf(name: string, seq: number): string {
	return `${slugify(name, ISSUE_KEY_FALLBACK, ISSUE_NAME_SLUG_MAX)}-${seq}`
}

/** The name of a task the orchestrator did not name: the first words of its title (or goal). */
export function defaultIssueName(title: string): string {
	return title.trim().split(/\s+/u).slice(0, DEFAULT_NAME_WORDS).join(' ')
}
