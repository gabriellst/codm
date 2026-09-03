// packages/api/typescript/src/agent/repositories/McpToolApprovalRepository/LibSqlMcpToolApprovalRepository.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { and, eq, isNull, type SQL } from 'drizzle-orm'
import { LibSqlDatabaseDriver, LibSqlTransaction, tryCatchAsync } from '@codm/core-typescript'
import { mcpToolApprovals } from '@codm/contracts/db'
import { McpToolApproval } from '../../entities/McpToolApproval'
import { McpToolApprovalRepository } from './McpToolApprovalRepository'

type McpToolApprovalRow = typeof mcpToolApprovals.$inferSelect

@injectable()
export class LibSqlMcpToolApprovalRepository extends McpToolApprovalRepository {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async findById(id: string, tx?: LibSqlTransaction): Promise<McpToolApproval | undefined> {
		return this.findOne(eq(mcpToolApprovals.id, id), tx)
	}

	async findByStopId(stopId: string, tx?: LibSqlTransaction): Promise<McpToolApproval | undefined> {
		return this.findOne(eq(mcpToolApprovals.stopId, stopId), tx)
	}

	async findByCall(issueId: string, callHash: string, tx?: LibSqlTransaction): Promise<McpToolApproval | undefined> {
		return this.findOne(and(eq(mcpToolApprovals.issueId, issueId), eq(mcpToolApprovals.callHash, callHash)), tx)
	}

	async findPendingByCall(issueId: string, callHash: string, tx?: LibSqlTransaction): Promise<McpToolApproval | undefined> {
		return this.findOne(
			and(eq(mcpToolApprovals.issueId, issueId), eq(mcpToolApprovals.callHash, callHash), isNull(mcpToolApprovals.decision)),
			tx,
		)
	}

	async save(entity: McpToolApproval, tx?: LibSqlTransaction): Promise<McpToolApproval> {
		const dbc = tx ?? this.driver.db
		entity.incrementVersion()
		const data = this.toPersistence(entity)
		await dbc
			.insert(mcpToolApprovals)
			.values(data)
			// O `set` é CURADO, e não o objeto inteiro: `id`, `ownerId`, `issueId`, `threadId`,
			// `serverKey`, `toolName`, `callHash` e `callArguments` são o que a linha É, não o que ela
			// vira. `decision`/`settledAt` (o flip) e `stopId`/`requestedAt` (o `reask` — a linha
			// REABERTA pela pergunta nova) mudam num update legítimo, mais as colunas de auditoria.
			.onConflictDoUpdate({
				target: mcpToolApprovals.id,
				set: {
					decision: data.decision,
					stopId: data.stopId,
					requestedAt: data.requestedAt,
					settledAt: data.settledAt,
					updatedAt: data.updatedAt,
					version: data.version,
				},
			})
		return entity
	}

	async delete(id: string, tx?: LibSqlTransaction): Promise<void> {
		const dbc = tx ?? this.driver.db
		await dbc.delete(mcpToolApprovals).where(eq(mcpToolApprovals.id, id))
	}

	private async findOne(where: SQL | undefined, tx?: LibSqlTransaction): Promise<McpToolApproval | undefined> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(mcpToolApprovals).where(where).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	private toPersistence(entity: McpToolApproval): typeof mcpToolApprovals.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId,
			issueId: entity.issueId,
			threadId: entity.threadId,
			serverKey: entity.serverKey,
			toolName: entity.toolName,
			callHash: entity.callHash,
			callArguments: entity.callArguments,
			decision: entity.decision ?? null,
			stopId: entity.stopId,
			requestedAt: entity.requestedAt,
			settledAt: entity.settledAt ?? null,
			updatedAt: new Date(),
			version: entity.version,
		}
	}

	private toDomain(row: McpToolApprovalRow): McpToolApproval {
		return new McpToolApproval({
			id: row.id,
			ownerId: row.ownerId,
			issueId: row.issueId,
			threadId: row.threadId,
			serverKey: row.serverKey,
			toolName: row.toolName,
			callHash: row.callHash,
			callArguments: row.callArguments,
			decision: row.decision ?? undefined,
			stopId: row.stopId,
			requestedAt: row.requestedAt,
			settledAt: row.settledAt ?? undefined,
			version: row.version,
		})
	}
}
