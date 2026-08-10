import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import { DrizzleDatabaseDriver, tryCatchAsync, DrizzleTransaction } from '@codm/core-typescript'
import { agentSessions } from '@codm/contracts/db'
import type { AgentModelId, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { AgentSession, AgentSessionSchema } from '../../entities/AgentSession'
import { AgentSessionRepository } from './AgentSessionRepository'

@injectable()
export class DrizzleAgentSessionRepository extends AgentSessionRepository {
	constructor(private driver: DrizzleDatabaseDriver) {
		super()
	}

	async findById(id: string, tx?: DrizzleTransaction): Promise<AgentSession | undefined> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(agentSessions).where(eq(agentSessions.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByIssueId(issueId: string, tx?: DrizzleTransaction): Promise<AgentSession | undefined> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(agentSessions).where(eq(agentSessions.issueId, issueId)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	/**
	 * The orchestrator's session: keyed by thread, and identified by the ABSENCE of an issue.
	 *
	 * `isNull` rather than a sentinel value, because that is what the partial unique
	 * `agent_sessions_orchestrator_unq ... WHERE issue_id IS NULL` indexes. A magic issueId would have
	 * needed its own uniqueness story and would have made every `findByIssueId` caller responsible for
	 * not matching it by accident.
	 */
	async findOrchestratorByThreadId(threadId: string, tx?: DrizzleTransaction): Promise<AgentSession | undefined> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc
				.select()
				.from(agentSessions)
				.where(and(eq(agentSessions.threadId, threadId), isNull(agentSessions.issueId)))
				.limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async save(entity: AgentSession, tx?: DrizzleTransaction): Promise<AgentSession> {
		entity.incrementVersion()
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(agentSessions)
				.values(data)
				.onConflictDoUpdate({
					target: agentSessions.id,
					set: {
						// `model` and `lastMessageId` are in the update set because they are exactly what a
						// later turn re-decides the resume from: a row that kept a stale model would resume
						// a session the CLI is no longer running, and one that kept a stale cursor would
						// report CONVERSATION_ADVANCED forever. `cwd` stays here too (a re-attach can move
						// the workspace), which is what makes CWD_CHANGED converge instead of latching.
						agentSessionId: data.agentSessionId,
						model: data.model,
						lastMessageId: data.lastMessageId,
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

	async delete(id: string, tx?: DrizzleTransaction): Promise<void> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			await dbc.delete(agentSessions).where(eq(agentSessions.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof agentSessions.$inferSelect): AgentSession {
		const parsed = AgentSessionSchema.parse({
			ownerId: row.ownerId,
			issueId: row.issueId ?? undefined,
			lastContextTokens: row.lastContextTokens ?? undefined,
			threadId: row.threadId,
			provider: row.provider as ProviderKind,
			cwd: row.cwd,
			agentSessionId: row.agentSessionId,
			model: row.model as AgentModelId,
			// SQL NULL ⇄ absent. The schema models "no cursor recorded yet" as an optional field, not as
			// a nullable one — MISSING_CURSOR is the domain's word for it, and `null` would be a second.
			lastMessageId: row.lastMessageId ?? undefined,
			lastTurnAt: row.lastTurnAt,
		})
		return new AgentSession({ ...parsed, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, version: row.version })
	}

	private toPersistence(entity: AgentSession): typeof agentSessions.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId,
			issueId: entity.issueId ?? null,
			lastContextTokens: entity.lastContextTokens ?? null,
			threadId: entity.threadId,
			provider: entity.provider,
			cwd: entity.cwd,
			agentSessionId: entity.agentSessionId,
			model: entity.model,
			lastMessageId: entity.lastMessageId ?? null,
			lastTurnAt: entity.lastTurnAt,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
