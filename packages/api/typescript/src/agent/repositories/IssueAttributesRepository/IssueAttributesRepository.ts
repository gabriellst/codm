import { Repository, type Transaction } from '@codm/core-typescript'
import type { IssueAttributes } from '../../entities/IssueAttributes'

/**
 * The agent's own table of task attributes (fase 4, S0c) — written in the transaction the issue is born in, so it
 * exists in the very turn that forked it (`issue_issues` is materialized later, from the `issue.created` fact).
 *
 * Every issue birth goes through `insertIfNew` (gated by `tests/architecture/issue-attributes-births.test.ts`): a
 * birth that skipped it would leave a task the queue (S4), the batch receipt (`ForkedIssueReader`) and the worktree
 * janitor (S3) treat as "older than fase 4" forever.
 */
export abstract class IssueAttributesRepository extends Repository<IssueAttributes> {
	/**
	 * Record a birth — atomic, FIRST WINS: a second birth of the same issue (a redelivered fact, a retried write)
	 * keeps the row it finds. What a task was born with never changes afterwards.
	 */
	abstract insertIfNew(attributes: IssueAttributes, tx?: Transaction): Promise<void>

	abstract findByIssueId(issueId: string, tx?: Transaction): Promise<IssueAttributes | undefined>

	/**
	 * The tasks whose registered worktree MAY be removed (fase 4, item 1): a worktree is registered, the task closed
	 * before `closedBefore`, NO queue item of the task was created after it closed (any item — pending, consumed or
	 * dead: an item after the closing is a reopening), and every OTHER task registered on the same worktree is eligible by
	 * the same rule (closed before `closedBefore`, not reopened) — a task still open, recent or reopened protects it. Only
	 * the database's half of the rule — git is asked by the janitor before anything is removed.
	 */
	abstract worktreeCandidates(closedBefore: Date, tx?: Transaction): Promise<IssueAttributes[]>

	// `save` (inherited) persists the STAMPS (`registerWorktree`, `close`) — `find → behavior → save`. The birth
	// columns are never part of its update: a saved entity cannot rewrite what the task was born with.
}
