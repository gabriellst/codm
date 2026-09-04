// packages/api/typescript/src/agent/repositories/McpServerRepository/LibSqlMcpServerRepository.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { and, eq, type SQL } from 'drizzle-orm'
import { LibSqlDatabaseDriver, LibSqlTransaction, tryCatchAsync } from '@codm/core-typescript'
import { mcpServers } from '@codm/contracts/db'
import { McpServer } from '../../entities/McpServer'
import { McpServerRepository } from './McpServerRepository'

type McpServerRow = typeof mcpServers.$inferSelect

@injectable()
export class LibSqlMcpServerRepository extends McpServerRepository {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async findById(id: string, tx?: LibSqlTransaction): Promise<McpServer | undefined> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(mcpServers).where(eq(mcpServers.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByKey(ownerId: string, key: string, tx?: LibSqlTransaction): Promise<McpServer | undefined> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc
				.select()
				.from(mcpServers)
				.where(and(eq(mcpServers.ownerId, ownerId), eq(mcpServers.key, key)))
				.limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async listByOwner(ownerId: string, tx?: LibSqlTransaction): Promise<McpServer[]> {
		return this.list(eq(mcpServers.ownerId, ownerId), tx)
	}

	async listEnabledByOwner(ownerId: string, tx?: LibSqlTransaction): Promise<McpServer[]> {
		return this.list(and(eq(mcpServers.ownerId, ownerId), eq(mcpServers.enabled, true)), tx)
	}

	async save(entity: McpServer, tx?: LibSqlTransaction): Promise<McpServer> {
		const dbc = tx ?? this.driver.db
		entity.incrementVersion()
		const data = this.toPersistence(entity)
		await dbc
			.insert(mcpServers)
			.values(data)
			// O `set` é CURADO, e não o objeto inteiro: `id`, `ownerId`, `key`, `addedAt` e `createdAt`
			// são o que a linha É, não o que ela vira. Reescrevê-los a cada save deixaria um bug de
			// identidade indistinguível de um update legítimo.
			.onConflictDoUpdate({
				target: mcpServers.id,
				set: {
					transport: data.transport,
					command: data.command,
					args: data.args,
					env: data.env,
					url: data.url,
					headers: data.headers,
					enabled: data.enabled,
					approvalPolicy: data.approvalPolicy,
					toolPolicies: data.toolPolicies,
					updatedAt: data.updatedAt,
					version: data.version,
				},
			})
		return entity
	}

	async delete(id: string, tx?: LibSqlTransaction): Promise<void> {
		const dbc = tx ?? this.driver.db
		await dbc.delete(mcpServers).where(eq(mcpServers.id, id))
	}

	private async list(where: SQL | undefined, tx?: LibSqlTransaction): Promise<McpServer[]> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(() => dbc.select().from(mcpServers).where(where))
		if (!result.success) return []
		return result.data.map(row => this.toDomain(row))
	}

	private toPersistence(entity: McpServer): typeof mcpServers.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId,
			key: entity.key,
			transport: entity.transport,
			command: entity.command ?? null,
			args: entity.args ?? null,
			env: entity.env ?? null,
			url: entity.url ?? null,
			headers: entity.headers ?? null,
			enabled: entity.enabled,
			approvalPolicy: entity.approvalPolicy,
			toolPolicies: entity.toolPolicies ?? null,
			addedAt: entity.addedAt,
			updatedAt: new Date(),
			version: entity.version,
		}
	}

	private toDomain(row: McpServerRow): McpServer {
		return new McpServer({
			id: row.id,
			ownerId: row.ownerId,
			key: row.key,
			transport: row.transport,
			command: row.command ?? undefined,
			args: row.args ?? undefined,
			env: row.env ?? undefined,
			url: row.url ?? undefined,
			headers: row.headers ?? undefined,
			enabled: row.enabled,
			approvalPolicy: row.approvalPolicy,
			toolPolicies: row.toolPolicies ?? undefined,
			addedAt: row.addedAt,
			version: row.version,
		})
	}
}
