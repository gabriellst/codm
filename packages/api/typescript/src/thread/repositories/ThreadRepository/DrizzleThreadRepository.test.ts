import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { threads, transcriptEntries } from '@codedm/contracts/db'
import { DrizzleClient, DrizzleDatabaseDriver } from '@codedm/core-typescript'
import { TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { TestBed, givenThread } from '@test/support'
import { OPERATOR_ID } from '@auth/operator'
import { ThreadRepository } from './ThreadRepository'

/**
 * The aggregate's persistence boundary now spans TWO tables (B4, decision 1), and the property that
 * makes the change worth making is atomicity: before B4 the entry was inserted by a repository of its
 * own, so nothing tied it to the thread write — and one of the four callers
 * (`DeliverOrchestratorReply`) had no transaction at all.
 */
describe('DrizzleThreadRepository — the thread row and its transcript entries commit or roll back together', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: DrizzleClient
	let driver: DrizzleDatabaseDriver
	let repo: ThreadRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		db = testBed.resolve(DrizzleClient)
		driver = testBed.resolve(DrizzleDatabaseDriver)
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
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		const entry = thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'gravado pelo agregado' })
		await driver.transaction(tx => repo.save(thread, tx))

		const rows = await entryRows(thread.id.value)
		expect(rows).toHaveLength(1)
		expect(rows[0]!.id).toBe(entry.entryId)
		expect(rows[0]!.text).toBe('gravado pelo agregado')
		expect(await db.select().from(threads).where(eq(threads.id, thread.id.value))).toHaveLength(1)
	})

	it('AC-3 FALSEADOR — a rolled-back transaction leaves NEITHER a new entry NOR the thread bump', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
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
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

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
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		for (const kind of Object.values(TranscriptKind)) {
			// The matrix decides who carries a sender; this case is about the constraint, not the matrix.
			thread.recordEntry({ kind, text: `kind ${kind}`, senderExternalId: kind === TranscriptKind.CONTACT ? 'contact-1' : undefined })
		}
		await driver.transaction(tx => repo.save(thread, tx))

		expect(await entryRows(thread.id.value)).toHaveLength(Object.values(TranscriptKind).length)
	})

	it('recentEntries returns the LAST n, chronological; findEntry resolves a citation with its threadId', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		for (let i = 0; i < 5; i++) thread.recordEntry({ kind: TranscriptKind.DIRECT, text: `linha ${i}`, at: new Date(1_000 * (i + 1)) })
		await driver.transaction(tx => repo.save(thread, tx))

		const window = await repo.recentEntries(thread.id.value, 3)
		expect(window.map(e => e.text)).toEqual(['linha 2', 'linha 3', 'linha 4'])

		const resolved = await repo.findEntry(window[0]!.entryId)
		expect(resolved?.threadId).toBe(thread.id.value)
	})

	it('findById does NOT hydrate history — a loaded thread carries zero pending writes', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'persistida' })
		await driver.transaction(tx => repo.save(thread, tx))

		const reloaded = await repo.findById(thread.id.value)

		expect(reloaded).toBeDefined()
		expect(reloaded!.pullPendingWrites().entries).toHaveLength(0)
	})
})
