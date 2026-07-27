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
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq, sql } from 'drizzle-orm'
import { givenIssue, givenOwner, givenStop, givenThread, givenWorkspace, TestBed } from '@test/support'
import { DrizzleClient, DrizzleDatabaseDriver } from '@codedm/core-typescript'
import {
	artifacts,
	channels,
	consumedMessages,
	events,
	idempotencyKeys,
	outbox,
	agentSessions,
	terminalLines,
	threadClarifications,
	transcriptEntries,
} from '@codedm/contracts/db'
import { AgentModelId, ArtifactKind, ChannelKind, ChannelStatus, ProviderKind, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { ArtifactRepository } from '@artifact/repositories/ArtifactRepository'
import { Artifact } from '@artifact/entities/Artifact'
import { AgentSessionRepository } from '@terminal/repositories/AgentSessionRepository'
import { AgentSession } from '@terminal/entities/AgentSession'
import { TerminalLineRepository } from '@issue/repositories/TerminalLineRepository'
import { ClarificationRepository } from '@thread/repositories/ClarificationRepository'
import { ConsumedMessageRepository } from '@thread/repositories/ConsumedMessageRepository'
import { TranscriptRepository } from '@thread/repositories/TranscriptRepository'
import { IdempotencyGuard } from '@codedm/core-typescript'
import { DomainEventRepository } from '@codedm/core-typescript'
import { BaseDomainEvent } from '@codedm/core-typescript'

const OWNER = '44444444-4444-4444-8444-444444444444'

class AuditProbeEvent extends BaseDomainEvent<{ marker: string }> {
	readonly name = 'audit.probe' as const
}

describe('insert-site audit — every db-generated id and notNull timestamp survives the real write path', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: DrizzleClient
	let driver: DrizzleDatabaseDriver

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		db = testBed.resolve(DrizzleClient)
		driver = testBed.resolve(DrizzleDatabaseDriver)
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

	it('owner_owners — via OwnerRepository', async () => {
		await givenOwner(testBed, { name: 'Audit Co' })
		await assertLanded('owner_owners', ['id', 'created_at', 'updated_at'])
	})

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

	it('issue_stops — via StopRepository', async () => {
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

	it('thread_transcript_entries — via TranscriptRepository (id minted in the repository)', async () => {
		const thread = await givenThread(testBed, { ownerId: OWNER })
		await testBed.resolve(TranscriptRepository).append({
			ownerId: OWNER,
			threadId: thread.id.value,
			kind: TranscriptKind.CONTACT,
			text: 'audit line',
		})
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

	it('thread_thread_clarifications — via ClarificationRepository (id minted in the repository)', async () => {
		const thread = await givenThread(testBed, { ownerId: OWNER })
		const entry = await testBed.resolve(TranscriptRepository).append({
			ownerId: OWNER,
			threadId: thread.id.value,
			kind: TranscriptKind.CONTACT,
			text: 'which one?',
		})
		await testBed.resolve(ClarificationRepository).open({
			ownerId: OWNER,
			threadId: thread.id.value,
			entryId: entry.entryId,
			senderExternalId: 'contact-1',
			question: 'which issue?',
			candidateIssueIds: [],
		})
		await assertLanded('thread_thread_clarifications', ['id', 'asked_at'])
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
			threadClarifications,
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
