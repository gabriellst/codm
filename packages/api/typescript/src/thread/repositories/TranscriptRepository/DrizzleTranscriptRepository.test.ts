import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread } from '@test/support'
import { TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { TranscriptRepository } from './TranscriptRepository'

/**
 * ENUM ↔ CHECK-CONSTRAINT COHERENCE, and it is not theoretical.
 *
 * `thread_transcript_entries.kind` carries a SQL CHECK generated from `Object.values(TranscriptKind)`
 * — but the constraint lives in a MIGRATION, which is a snapshot. Rename a member in the contract and
 * the schema says one thing while every already-applied database says another; the write fails at
 * runtime, in production, on a path no test covered.
 *
 * That is exactly what happened when AGENT/OPERATOR_DIRECT became SYSTEM/DIRECT: nothing in the suite
 * wrote either value (`SYSTEM` had no producer at all, `DIRECT` only via `SendDirectMessage`, which
 * has no test), so the mismatch was invisible until the constraint was read by hand. This test makes
 * the whole enum a gate: add or rename a member without a migration and it goes red here.
 */
describe('TranscriptRepository — every TranscriptKind survives the DB check constraint', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('appends and reads back one entry per declared kind', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const repo = testBed.resolve(TranscriptRepository)
		const kinds = Object.values(TranscriptKind)
		expect(kinds.length).toBeGreaterThan(0)

		for (const kind of kinds) {
			await repo.append({ ownerId: OPERATOR_ID, threadId: thread.id.value, kind, text: `line for ${kind}` })
		}

		const entries = await repo.recentByThread(thread.id.value, kinds.length * 2)
		// Every member round-trips — a value the migration's CHECK does not know would have thrown on
		// insert, long before this assertion.
		expect(entries.map(e => e.kind).sort()).toEqual([...kinds].sort())
	})
})
