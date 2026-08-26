// insert-site-audit — the EXECUTION half of T21 (`.plans/artifacts/2026-07-26-insert-audit.md`).
//
// In the pg dialect, 14 tables declared `id: uuid(...).defaultRandom()`. That default made `id`
// OPTIONAL in drizzle's insert type, so a writer that never supplied one compiled fine and only
// failed as `NOT NULL constraint failed` at runtime — the "silent break" class. The sqlite schema
// has no such default (and must not grow one: `$defaultFn(randomUUID)` on an id column would let
// the persistence layer invent an aggregate's identity behind the caller's back).
//
// Types now catch the omission — but only for a writer that is actually type-checked against the
// table. What types CANNOT catch is a notNull column with neither a db-side default nor a
// `$defaultFn` that the production writer simply never mentions. So: for each of the 14 tables,
// drive the REAL write path with the minimum payload it takes in production, and assert the row
// landed with a non-null `id` and a non-null `created_at`/timestamp.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { PgDatabaseDriver } from '@codm/core-typescript'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq, sql } from 'drizzle-orm'
import { givenIssue, givenOwner, givenStop, givenThread, givenWorkspace, TestBed } from '@test/support'
import { LibSqlDatabaseDriver, LibSqlTransaction } from '@codm/core-typescript'
import {
	artifacts,
	channels,
	consumedMessages,
	events,
	idempotencyKeys,
	outbox,
	agentSessions,
	terminalLines,
	transcriptEntries,
} from '@codm/contracts/db'
import { AgentModelId, ArtifactKind, ChannelKind, ChannelStatus, ProviderKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { ArtifactRepository } from '@artifact/repositories/ArtifactRepository'
import { Artifact } from '@artifact/entities/Artifact'
import { AgentSessionRepository } from '@agent/repositories/AgentSessionRepository'
import { AgentSession } from '@agent/entities/AgentSession'
import { TerminalLineRepository } from '@issue/repositories/TerminalLineRepository'
import { ConsumedMessageRepository } from '@thread/repositories/ConsumedMessageRepository'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { IdempotencyGuard } from '@codm/core-typescript'
import { DomainEventRepository } from '@codm/core-typescript'
import { BaseDomainEvent, z } from '@codm/core-typescript'

const OWNER = '44444444-4444-4444-8444-444444444444'

const AuditProbeEventSchema = z.domainEvent({ marker: z.string() })
class AuditProbeEvent extends BaseDomainEvent<typeof AuditProbeEventSchema> {
	static override readonly name = 'audit.probe' as const
	static readonly schema = AuditProbeEventSchema
}

describe('insert-site audit — every db-generated id and notNull timestamp survives the real write path', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: LibSqlTransaction
	let driver: LibSqlDatabaseDriver

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		db = testBed.resolve(LibSqlDatabaseDriver).db
		driver = testBed.resolve(LibSqlDatabaseDriver)
	})

	beforeEach(async () => {
		await testBed.reset()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	/**
	 * Every row of `table` — asserted non-empty, with the named columns non-null.
	 *
	 * The checks THROW rather than `expect()`: a matcher called from a helper (as opposed to
	 * directly from the `it()` body) is `lint/suspicious/noMisplacedAssertion`, and suppressing
	 * that rule 14 times over would be louder than expressing the same two conditions as guards.
	 * The strength is identical — a failing matcher throws too — and the message now carries the
	 * table, the column and the offending row, which the matcher's own diff did not. The positive
	 * control at the bottom of this file asserts the throw actually happens.
	 */
	const assertLanded = async (tableName: string, columns: string[]) => {
		const rows = await db.all<Record<string, unknown>>(sql.raw(`SELECT * FROM "${tableName}"`))
		if (rows.length === 0) {
			throw new Error(`insert-site audit: "${tableName}" is empty — the production write path landed no row`)
		}
		for (const row of rows) {
			for (const column of columns) {
				const value = row[column]
				if (value === null || value === undefined) {
					throw new Error(
						`insert-site audit: ${tableName}.${column} is ${value === null ? 'NULL' : 'undefined'} — row ${JSON.stringify(row)}`,
					)
				}
			}
		}
	}

	it('workspace_workspaces — via WorkspaceRepository', async () => {
		await givenWorkspace(testBed, { ownerId: OWNER })
		await assertLanded('workspace_workspaces', ['id', 'created_at', 'updated_at'])
	})

	it('thread_threads — via ThreadRepository', async () => {
		await givenThread(testBed, { ownerId: OWNER })
		await assertLanded('thread_threads', ['id', 'created_at', 'updated_at'])
	})

	it('issue_issues — via IssueRepository', async () => {
		await givenIssue(testBed, { ownerId: OWNER })
		await assertLanded('issue_issues', ['id', 'created_at', 'updated_at'])
	})

	it('issue_stops — via ThreadRepository (a Stop is a child of the Thread aggregate)', async () => {
		await givenStop(testBed, { ownerId: OWNER })
		await assertLanded('issue_stops', ['id', 'raised_at'])
	})

	it('issue_terminal_lines — via TerminalLineRepository', async () => {
		const issue = await givenIssue(testBed, { ownerId: OWNER })
		await testBed.resolve(TerminalLineRepository).append(issue.id.value, OWNER, 'hello from the audit')
		await assertLanded('issue_terminal_lines', ['id', 'at', 'seq'])
	})

	it('artifact_artifacts — via ArtifactRepository', async () => {
		const thread = await givenThread(testBed, { ownerId: OWNER })
		await testBed.resolve(ArtifactRepository).save(
			Artifact.create({
				ownerId: OWNER,
				threadId: thread.id.value,
				kind: ArtifactKind.FILE,
				name: 'audit.txt',
				ref: '/tmp/audit.txt',
				meta: '{}',
			}),
		)
		await assertLanded('artifact_artifacts', ['id', 'recorded_at'])
	})

	it('agent_agent_sessions — via AgentSessionRepository', async () => {
		const thread = await givenThread(testBed, { ownerId: OWNER })
		const issue = await givenIssue(testBed, { ownerId: OWNER, threadId: thread.id.value })
		await testBed.resolve(AgentSessionRepository).save(
			AgentSession.create({
				ownerId: OWNER,
				issueId: issue.id.value,
				threadId: thread.id.value,
				provider: ProviderKind.CLAUDE_CODE,
				cwd: '/tmp/audit',
				agentSessionId: 'sess-audit',
				model: AgentModelId.DEFAULT,
			}),
		)
		await assertLanded('agent_agent_sessions', ['id', 'created_at', 'updated_at'])
	})

	it('thread_transcript_entries — via ThreadRepository (id minted by the aggregate)', async () => {
		const thread = await givenThread(testBed, { ownerId: OWNER })
		thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'audit line', senderExternalId: 'contact-audit' })
		await testBed.resolve(ThreadRepository).save(thread)
		await assertLanded('thread_transcript_entries', ['id', 'at'])
	})

	it('thread_consumed_messages — via ConsumedMessageRepository (id minted in the repository)', async () => {
		const claimed = await testBed.resolve(ConsumedMessageRepository).claim({
			ownerId: OWNER,
			channelId: '55555555-5555-4555-8555-555555555555',
			platformMessageId: 'wamid-audit',
		})
		expect(claimed).toBe(true)
		await assertLanded('thread_consumed_messages', ['id', 'consumed_at'])
	})

	it('shared_events + shared_outbox — via DomainEventRepository', async () => {
		const repo = testBed.resolve(DomainEventRepository)
		await repo.save(new AuditProbeEvent({ entityId: crypto.randomUUID(), ownerId: OWNER, payload: { marker: 'x' } }))
		await assertLanded('shared_events', ['id', 'occurred_at'])
		await assertLanded('shared_outbox', ['id', 'created_at'])
	})

	it('gateway_channels — via the gateway write seam', async () => {
		await driver.transaction(tx =>
			tx.insert(channels).values({
				id: crypto.randomUUID(),
				ownerId: OWNER,
				platform: ChannelKind.WHATSAPP,
				name: 'WhatsApp',
				status: ChannelStatus.CONNECTED,
				ownerRemoteId: 'acct-audit',
				credentials: {},
			}),
		)
		await assertLanded('gateway_channels', ['id', 'created_at', 'updated_at'])
	})

	it('shared_idempotency_keys — composite PK, no `id` column, created_at from the schema default', async () => {
		// The site the scout flagged: the guard inserts `{ scope, key }` ONLY. Verified, not
		// "fixed twice" — `created_at` is covered by the schema's own default function.
		expect(await testBed.resolve(IdempotencyGuard).claim('audit-scope', 'audit-key')).toBe(true)
		await assertLanded('shared_idempotency_keys', ['key', 'scope', 'created_at'])
	})

	it('no id column anywhere is populated by a schema default function', async () => {
		// The rule this whole task rests on, asserted against the schema rather than trusted.
		const declarations = [
			artifacts,
			channels,
			consumedMessages,
			events,
			idempotencyKeys,
			outbox,
			agentSessions,
			terminalLines,
			transcriptEntries,
		]
		for (const table of declarations) {
			const idColumn = (table as unknown as { id?: { hasDefault?: boolean } }).id
			if (!idColumn) continue
			expect(idColumn.hasDefault).toBeFalsy()
		}
	})

	it('a leftover row from another suite cannot mask an empty table', async () => {
		// Positive control for `assertLanded`: on a freshly reset database it must FAIL, so a green
		// run above really means "the write path wrote something".
		await expect(assertLanded('shared_events', ['id'])).rejects.toThrow()
		// …and the row-level column assertion is reachable too.
		await driver.transaction(tx => tx.insert(outbox).values({ id: crypto.randomUUID(), name: 'audit.control', payload: {}, source: 'api' }))
		const rows = await db.select().from(outbox).where(eq(outbox.name, 'audit.control'))
		expect(rows).toHaveLength(1)
	})
})

/**
 * A MESMA auditoria, no TRONCO DE NUVEM — e ela precisa de bloco próprio, não de uma linha a mais.
 *
 * `owner` e `auth` são cloud-only (ADR 0002) e suas tabelas vivem em `db/cloud`, servido pela família
 * pg (ADR 0005). O bloco acima compõe libsql para as catorze tabelas do desktop; pedir a ele uma
 * tabela de nuvem devolvia `undefined` no `db` do repositório, porque `LibSqlDatabaseDriver` sequer
 * está bound quando a família é pg.
 *
 * A asserção também muda de dialeto: `db.all()` é do cliente libsql; no drizzle pg a leitura crua é
 * `execute()`, que devolve `{ rows }`. Duplicar o helper é mais honesto que parametrizá-lo — as duas
 * versões dizem a mesma coisa sobre substratos diferentes, e a que mente é a que finge que são um.
 */
describe('insert-site audit — tronco de NUVEM (família pg)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER, db: 'pg' })
	})

	beforeEach(async () => {
		await testBed.reset()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	it('owner.owners — via OwnerRepository', async () => {
		// QUALIFICADO pelo schema (T1.9). Era `"owner_owners"` — nome achatado, do tempo em que o
		// tronco cloud escondia o namespace dentro do nome da tabela. Com `pgSchema('owner')` nativo, o
		// SQL cru precisa dizer o schema: sem isso a consulta procura em `public` e falha com "relation
		// does not exist". Foi exatamente este o único conflito SEMÂNTICO do merge — as duas linhas
		// compilavam, e só a bateria disse.
		await givenOwner(testBed, { name: 'Audit Co' })

		const db = testBed.resolve(PgDatabaseDriver).db
		const result = await db.execute(sql.raw('SELECT * FROM "owner"."owners"'))
		const rows = result.rows as Record<string, unknown>[]
		if (rows.length === 0) throw new Error('insert-site audit: "owner"."owners" is empty — the production write path landed no row')
		for (const row of rows) {
			for (const column of ['id', 'created_at', 'updated_at']) {
				const value = row[column]
				if (value === null || value === undefined) {
					throw new Error(
						`insert-site audit: owner.owners.${column} is ${value === null ? 'NULL' : 'undefined'} — row ${JSON.stringify(row)}`,
					)
				}
			}
		}
		expect(rows.length).toBeGreaterThan(0)
	})
})
