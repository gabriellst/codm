import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { threads, transcriptEntries, stops } from '@codm/contracts/db'
import { LibSqlDatabaseDriver, LibSqlTransaction } from '@codm/core-typescript'
import { TranscriptKind, StopKind, StopResolution, ProviderKind, AgentModelId, Language } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from './ThreadRepository'

/**
 * The aggregate's persistence boundary now spans TWO tables (B4, decision 1), and the property that
 * makes the change worth making is atomicity: before B4 the entry was inserted by a repository of its
 * own, so nothing tied it to the thread write — and one of the four callers
 * (`DeliverOrchestratorReply`) had no transaction at all.
 */
describe('LibSqlThreadRepository — the thread row and its transcript entries commit or roll back together', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: LibSqlTransaction
	let driver: LibSqlDatabaseDriver
	let repo: ThreadRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		db = testBed.resolve(LibSqlDatabaseDriver).db
		driver = testBed.resolve(LibSqlDatabaseDriver)
	})
	beforeEach(async () => {
		await testBed.reset()
		repo = testBed.resolve(ThreadRepository)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const entryRows = async (threadId: string) => db.select().from(transcriptEntries).where(eq(transcriptEntries.threadId, threadId))

	it('AC-3 — save(thread, tx) persists the thread row AND the accumulated entries', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		const entry = thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'gravado pelo agregado' })
		await driver.transaction(tx => repo.save(thread, tx))

		const rows = await entryRows(thread.id.value)
		expect(rows).toHaveLength(1)
		expect(rows[0]!.id).toBe(entry.entryId)
		expect(rows[0]!.text).toBe('gravado pelo agregado')
		expect(await db.select().from(threads).where(eq(threads.id, thread.id.value))).toHaveLength(1)
	})

	it('AC-3 FALSEADOR — a rolled-back transaction leaves NEITHER a new entry NOR the thread bump', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const versionBefore = (await db.select().from(threads).where(eq(threads.id, thread.id.value)))[0]!.version

		thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'nunca commitado' })
		await expect(
			driver.transaction(async tx => {
				await repo.save(thread, tx)
				// The entry is visible INSIDE the transaction — proof the write happened and was undone,
				// not that it never ran.
				expect(await repo.listEntries(thread.id.value, tx)).toHaveLength(1)
				throw new Error('rollback')
			}),
		).rejects.toThrow('rollback')

		expect(await entryRows(thread.id.value)).toHaveLength(0)
		expect((await db.select().from(threads).where(eq(threads.id, thread.id.value)))[0]!.version).toBe(versionBefore)
	})

	it('writes MANY entries recorded in one unit of work, in the order they were recorded', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		const first = thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'pergunta', senderExternalId: 'contact-1', at: new Date(1_000) })
		const second = thread.recordEntry({
			kind: TranscriptKind.SYSTEM,
			text: 'resposta',
			quotedEntry: { entryId: first.entryId, threadId: thread.id.value },
			at: new Date(2_000),
		})
		await driver.transaction(tx => repo.save(thread, tx))

		const listed = await repo.listEntries(thread.id.value)
		expect(listed.map(e => e.entryId)).toEqual([first.entryId, second.entryId])
		expect(listed[1]!.quotedEntryId).toBe(first.entryId)
	})

	// Migrated verbatim in intent from DrizzleTranscriptRepository.test.ts, which T3 deletes: the DB
	// CHECK constraint on `kind` enumerates the enum, so a value the code accepts and the constraint
	// rejects is a runtime-only failure no type check catches.
	it('every TranscriptKind survives the DB check constraint', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		for (const kind of Object.values(TranscriptKind)) {
			// The matrix decides who carries a sender; this case is about the constraint, not the matrix.
			thread.recordEntry({ kind, text: `kind ${kind}`, senderExternalId: kind === TranscriptKind.CONTACT ? 'contact-1' : undefined })
		}
		await driver.transaction(tx => repo.save(thread, tx))

		expect(await entryRows(thread.id.value)).toHaveLength(Object.values(TranscriptKind).length)
	})

	it('recentEntries returns the LAST n, chronological; findEntry resolves a citation with its threadId', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		for (let i = 0; i < 5; i++) thread.recordEntry({ kind: TranscriptKind.DIRECT, text: `linha ${i}`, at: new Date(1_000 * (i + 1)) })
		await driver.transaction(tx => repo.save(thread, tx))

		const window = await repo.recentEntries(thread.id.value, 3)
		expect(window.map(e => e.text)).toEqual(['linha 2', 'linha 3', 'linha 4'])

		const resolved = await repo.findEntry(window[0]!.entryId)
		expect(resolved?.threadId).toBe(thread.id.value)
	})

	it('findById does NOT hydrate history — a loaded thread carries zero pending writes', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'persistida' })
		await driver.transaction(tx => repo.save(thread, tx))

		const reloaded = await repo.findById(thread.id.value)

		expect(reloaded).toBeDefined()
		expect(reloaded!.pullPendingWrites().entries).toHaveLength(0)
	})

	// ── The stop half of the aggregate (B4, spec decision 4) ──────────────────────────────────────

	it('AC-7 — save persists a stop with issue_id NULL, and the read returns it', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		const stop = thread.raiseStop({ kind: StopKind.HUMAN_REQUESTED, title: 'preciso de você', detail: 'a pergunta' })
		await driver.transaction(tx => repo.save(thread, tx))

		const row = (await db.select().from(stops).where(eq(stops.id, stop.stopId)))[0]
		expect(row).toBeDefined()
		expect(row!.issueId).toBeNull()
		expect(await repo.openStops(thread.id.value)).toHaveLength(1)
	})

	it('AC-7 — resolveStop stamps resolution + resolvedAt regardless of whether the stop has an issue', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const stop = thread.raiseStop({ kind: StopKind.APPROVAL_NEEDED, title: 't', detail: 'd' })
		await driver.transaction(tx => repo.save(thread, tx))

		const loaded = await repo.findStop(stop.stopId)
		thread.resolveStop(loaded!, StopResolution.APPROVE)
		await driver.transaction(tx => repo.save(thread, tx))

		expect(await repo.openStops(thread.id.value)).toHaveLength(0)
		expect((await repo.findStop(stop.stopId))!.resolution).toBe(StopResolution.APPROVE)
	})

	it('AC-3 — the stop and the thread roll back together', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		thread.raiseStop({ kind: StopKind.SERVER_ERROR, title: 't', detail: 'd' })

		await expect(
			driver.transaction(async tx => {
				await repo.save(thread, tx)
				throw new Error('rollback')
			}),
		).rejects.toThrow('rollback')

		expect(await repo.openStops(thread.id.value)).toHaveLength(0)
	})

	/**
	 * The per-provider model map survives the round trip in the SHAPE the aggregate keeps it in.
	 *
	 * The falsifier is the second assertion, not the first: a mapper that wrote `DEFAULT` instead of
	 * dropping the key would still read back a thread whose `modelFor` answers `DEFAULT` — the bug is
	 * invisible from the domain side and only the ROW shows it. So the row is read directly.
	 */
	it('persists the per-provider model map, and a cleared choice leaves no key behind', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, providers: [ProviderKind.CLAUDE_CODE] })

		thread.configureModel(ProviderKind.CLAUDE_CODE, AgentModelId.OPUS)
		await repo.save(thread)

		expect((await repo.findById(thread.id.value))!.modelFor(ProviderKind.CLAUDE_CODE)).toBe(AgentModelId.OPUS)

		const reloaded = (await repo.findById(thread.id.value))!
		reloaded.configureModel(ProviderKind.CLAUDE_CODE, AgentModelId.DEFAULT)
		await repo.save(reloaded)

		const [row] = await db.select().from(threads).where(eq(threads.id, thread.id.value))
		expect(row!.modelByProvider).toEqual({})
	})

	/**
	 * A thread written before migration 0012 backfills to `'{}'` — it must LOAD, not throw. The column
	 * is `NOT NULL DEFAULT '{}'` precisely so this is the only legacy shape there is.
	 */
	it('loads a thread that never chose a model', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		expect((await repo.findById(thread.id.value))!.modelByProvider).toEqual({})
	})

	/**
	 * `reactionsEnabled`/`streamingEnabled` (reactions/streaming spec) — BOTH directions, same shape as
	 * `thinkingIndicatorEnabled`'s sibling toggles: a flip that never reaches the `onConflictDoUpdate`
	 * SET clause reads back as if it were never saved.
	 */
	it('reactionsEnabled and streamingEnabled default ON, and a flip to OFF then back to ON both persist', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		expect(thread.reactionsEnabled).toBe(true)
		expect(thread.streamingEnabled).toBe(true)

		thread.configureReactions(false)
		thread.configureStreaming(false)
		await repo.save(thread)

		const disabled = (await repo.findById(thread.id.value))!
		expect(disabled.reactionsEnabled).toBe(false)
		expect(disabled.streamingEnabled).toBe(false)

		disabled.configureReactions(true)
		disabled.configureStreaming(true)
		await repo.save(disabled)

		const reenabled = (await repo.findById(thread.id.value))!
		expect(reenabled.reactionsEnabled).toBe(true)
		expect(reenabled.streamingEnabled).toBe(true)
	})

	/**
	 * `language` (i18n-das-pistas spec) — same both-directions rule as the toggles above, with a sharper
	 * failure mode: the ERASE is the direction that matters. A `configureLanguage(undefined)` missing
	 * from the `onConflictDoUpdate` SET clause would leave the console reporting "follows the account"
	 * while every turn kept speaking the language nobody can see chosen any more.
	 */
	it('language round-trips, and clearing it writes NULL rather than being silently skipped', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		// Born declaring nothing — the column is NULL, which is what "follow the account" IS.
		expect(thread.language).toBeUndefined()

		thread.configureLanguage(Language.EN_US)
		await repo.save(thread)

		const declared = (await repo.findById(thread.id.value))!
		expect(declared.language).toBe(Language.EN_US)
		const [row] = await db.select().from(threads).where(eq(threads.id, thread.id.value))
		expect(row?.language).toBe(Language.EN_US)

		declared.configureLanguage(undefined)
		await repo.save(declared)

		const cleared = (await repo.findById(thread.id.value))!
		expect(cleared.language).toBeUndefined()
		const [clearedRow] = await db.select().from(threads).where(eq(threads.id, thread.id.value))
		expect(clearedRow?.language).toBeNull()
	})
})
