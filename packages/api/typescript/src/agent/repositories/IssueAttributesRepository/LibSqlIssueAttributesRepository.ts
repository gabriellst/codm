import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { LibSqlDatabaseDriver, LibSqlTransaction } from '@codm/core-typescript'
import { agentIssueAttributes } from '@codm/contracts/db'
import { IssueAttributes } from '../../entities/IssueAttributes'
import { IssueAttributesRepository } from './IssueAttributesRepository'

type Row = typeof agentIssueAttributes.$inferSelect

@injectable()
export class LibSqlIssueAttributesRepository extends IssueAttributesRepository {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	/** Joins the caller's transaction; alone, it takes the driver's write path (never the read handle). */
	private write<Return>(tx: LibSqlTransaction | undefined, fn: (dbc: LibSqlTransaction) => Promise<Return>): Promise<Return> {
		return tx ? fn(tx) : this.driver.transaction(fn)
	}

	async insertIfNew(attributes: IssueAttributes, tx?: LibSqlTransaction): Promise<void> {
		await this.write(tx, dbc =>
			dbc.insert(agentIssueAttributes).values(toPersistence(attributes)).onConflictDoNothing({ target: agentIssueAttributes.issueId }),
		)
	}

	async findByIssueId(issueId: string, tx?: LibSqlTransaction): Promise<IssueAttributes | undefined> {
		const dbc = tx ?? this.driver.db
		const [row] = await dbc.select().from(agentIssueAttributes).where(eq(agentIssueAttributes.issueId, issueId)).limit(1)
		return row ? toDomain(row) : undefined
	}

	async save(attributes: IssueAttributes, tx?: LibSqlTransaction): Promise<IssueAttributes> {
		const data = toPersistence(attributes)
		await this.write(tx, dbc =>
			dbc
				.insert(agentIssueAttributes)
				.values(data)
				.onConflictDoUpdate({
					target: agentIssueAttributes.issueId,
					// ONLY the stamps. Priority, reason, kind and model are the birth's and are absent from this set on
					// purpose — enforced by omission, so no saved aggregate can rewrite them.
					set: { worktreePath: data.worktreePath, worktreeSeenAt: data.worktreeSeenAt, closedAt: data.closedAt },
				}),
		)
		return attributes
	}

	async delete(issueId: string, tx?: LibSqlTransaction): Promise<void> {
		await this.write(tx, dbc => dbc.delete(agentIssueAttributes).where(eq(agentIssueAttributes.issueId, issueId)))
	}
}

function toDomain(row: Row): IssueAttributes {
	return new IssueAttributes({
		id: row.issueId,
		ownerId: row.ownerId,
		threadId: row.threadId,
		priority: row.priority,
		priorityReason: row.priorityReason,
		workKind: row.workKind,
		model: row.model ?? undefined,
		worktreePath: row.worktreePath ?? undefined,
		worktreeSeenAt: row.worktreeSeenAt ?? undefined,
		closedAt: row.closedAt ?? undefined,
		createdAt: row.createdAt,
	})
}

function toPersistence(attributes: IssueAttributes): typeof agentIssueAttributes.$inferInsert {
	return {
		issueId: attributes.issueId,
		ownerId: attributes.ownerId,
		threadId: attributes.threadId,
		priority: attributes.priority,
		priorityReason: attributes.priorityReason,
		workKind: attributes.workKind,
		model: attributes.model ?? null,
		worktreePath: attributes.worktreePath ?? null,
		worktreeSeenAt: attributes.worktreeSeenAt ?? null,
		closedAt: attributes.closedAt ?? null,
		createdAt: attributes.createdAt,
	}
}
