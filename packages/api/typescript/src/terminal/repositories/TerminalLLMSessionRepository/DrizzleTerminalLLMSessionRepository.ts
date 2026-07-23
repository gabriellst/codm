import { injectable } from 'tsyringe-neo'
import { desc, eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codedm/core-typescript'
import { terminalLLMSessions } from '@codedm/contracts/db'
import type { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { TerminalLLMSession, TerminalLLMSessionSchema } from '../../entities/TerminalLLMSession'
import { TerminalLLMSessionRepository } from './TerminalLLMSessionRepository'

@injectable()
export class DrizzleTerminalLLMSessionRepository extends TerminalLLMSessionRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findById(id: string, tx?: DrizzleClient): Promise<TerminalLLMSession | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(terminalLLMSessions).where(eq(terminalLLMSessions.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByIssueId(issueId: string, tx?: DrizzleClient): Promise<TerminalLLMSession | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(terminalLLMSessions).where(eq(terminalLLMSessions.issueId, issueId)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async listRecentForPrewarm(limit: number, tx?: DrizzleClient): Promise<TerminalLLMSession[]> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () =>
			dbc.select().from(terminalLLMSessions).orderBy(desc(terminalLLMSessions.lastTurnAt)).limit(limit),
		)
		if (!result.success || !result.data) return []
		return result.data.map(r => this.toDomain(r))
	}

	async save(entity: TerminalLLMSession, tx?: DrizzleClient): Promise<TerminalLLMSession> {
		entity.incrementVersion()
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(terminalLLMSessions)
				.values(data)
				.onConflictDoUpdate({
					target: terminalLLMSessions.id,
					set: {
						claudeSessionId: data.claudeSessionId,
						cwd: data.cwd,
						provider: data.provider,
						lastTurnAt: data.lastTurnAt,
						updatedAt: new Date(),
						version: data.version,
					},
				})
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: DrizzleClient): Promise<void> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			await dbc.delete(terminalLLMSessions).where(eq(terminalLLMSessions.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof terminalLLMSessions.$inferSelect): TerminalLLMSession {
		const parsed = TerminalLLMSessionSchema.parse({
			ownerId: row.ownerId,
			issueId: row.issueId,
			threadId: row.threadId,
			provider: row.provider as ProviderKind,
			cwd: row.cwd,
			claudeSessionId: row.claudeSessionId,
			lastTurnAt: row.lastTurnAt,
		})
		return new TerminalLLMSession({ ...parsed, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, version: row.version })
	}

	private toPersistence(entity: TerminalLLMSession): typeof terminalLLMSessions.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId,
			issueId: entity.issueId,
			threadId: entity.threadId,
			provider: entity.provider,
			cwd: entity.cwd,
			claudeSessionId: entity.claudeSessionId,
			lastTurnAt: entity.lastTurnAt,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
