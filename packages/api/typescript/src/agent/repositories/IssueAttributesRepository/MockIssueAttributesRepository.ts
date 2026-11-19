import { injectable } from 'tsyringe-neo'
import { IssueAttributes } from '../../entities/IssueAttributes'
import { IssueAttributesRepository } from './IssueAttributesRepository'

/** In-memory twin, same semantics: the first birth wins, a save moves only the stamps. */
@injectable()
export class MockIssueAttributesRepository extends IssueAttributesRepository {
	private readonly rows = new Map<string, IssueAttributes>()

	async insertIfNew(attributes: IssueAttributes): Promise<void> {
		if (!this.rows.has(attributes.issueId)) this.rows.set(attributes.issueId, copyOf(attributes))
	}

	async findByIssueId(issueId: string): Promise<IssueAttributes | undefined> {
		const row = this.rows.get(issueId)
		return row ? copyOf(row) : undefined
	}

	/** The table's half only — the mock has no queue to consult, so it answers by the closing and the sharing. */
	async worktreeCandidates(closedBefore: Date): Promise<IssueAttributes[]> {
		const rows = [...this.rows.values()]
		return rows
			.filter(row => row.worktreePath !== undefined && row.closedAt !== undefined && row.closedAt < closedBefore)
			.filter(
				row =>
					!rows.some(
						other =>
							other.issueId !== row.issueId &&
							other.worktreePath === row.worktreePath &&
							(other.closedAt === undefined || other.closedAt >= closedBefore),
					),
			)
			.map(copyOf)
	}

	async save(attributes: IssueAttributes): Promise<IssueAttributes> {
		const existing = this.rows.get(attributes.issueId)
		const next = copyOf(existing ?? attributes)
		next.worktreePath = attributes.worktreePath
		next.worktreeSeenAt = attributes.worktreeSeenAt
		next.closedAt = attributes.closedAt
		this.rows.set(attributes.issueId, next)
		return attributes
	}

	async delete(issueId: string): Promise<void> {
		this.rows.delete(issueId)
	}
}

function copyOf(attributes: IssueAttributes): IssueAttributes {
	return new IssueAttributes({
		id: attributes.issueId,
		ownerId: attributes.ownerId,
		threadId: attributes.threadId,
		priority: attributes.priority,
		priorityReason: attributes.priorityReason,
		workKind: attributes.workKind,
		model: attributes.model,
		worktreePath: attributes.worktreePath,
		worktreeSeenAt: attributes.worktreeSeenAt,
		closedAt: attributes.closedAt,
		createdAt: attributes.createdAt,
	})
}
