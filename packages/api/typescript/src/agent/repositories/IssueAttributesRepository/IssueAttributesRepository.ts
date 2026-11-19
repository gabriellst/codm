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

	// `save` (inherited) persists the STAMPS (`registerWorktree`, `close`) — `find → behavior → save`. The birth
	// columns are never part of its update: a saved entity cannot rewrite what the task was born with.
}
