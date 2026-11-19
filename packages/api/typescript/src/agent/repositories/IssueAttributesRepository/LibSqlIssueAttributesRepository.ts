import { injectable } from 'tsyringe-neo'
import { and, eq, isNotNull, lt, sql } from 'drizzle-orm'
import { LibSqlDatabaseDriver, LibSqlTransaction } from '@codm/core-typescript'
import { agentIssueAttributes, agentMailbox } from '@codm/contracts/db'
import { MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
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

	async worktreeCandidates(closedBefore: Date, tx?: LibSqlTransaction): Promise<IssueAttributes[]> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc
			.select()
			.from(agentIssueAttributes)
			.where(
				and(
					isNotNull(agentIssueAttributes.worktreePath),
					lt(agentIssueAttributes.closedAt, closedBefore),
					sql`NOT EXISTS (SELECT 1 FROM ${agentMailbox} WHERE ${agentMailbox.targetKind} = ${MailboxTargetKind.ISSUE} AND ${agentMailbox.targetId} = ${agentIssueAttributes.issueId} AND ${agentMailbox.createdAt} > ${agentIssueAttributes.closedAt})`,
					// every OTHER task registered on the same worktree must be eligible too: closed before the cutoff and not
					// reopened since. The inner tables are aliased so the outer columns (qualified by the table name) stay
					// the correlated ones.
					sql`NOT EXISTS (SELECT 1 FROM agent_issue_attributes AS sharer WHERE sharer.worktree_path = ${agentIssueAttributes.worktreePath} AND sharer.issue_id <> ${agentIssueAttributes.issueId} AND (sharer.closed_at IS NULL OR sharer.closed_at >= ${closedBefore.getTime()} OR EXISTS (SELECT 1 FROM agent_mailbox AS later WHERE later.target_kind = ${MailboxTargetKind.ISSUE} AND later.target_id = sharer.issue_id AND later.created_at > sharer.closed_at)))`,
				),
			)
		return rows.map(toDomain)
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
