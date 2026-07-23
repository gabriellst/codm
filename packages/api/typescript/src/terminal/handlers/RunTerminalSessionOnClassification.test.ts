import { testId } from '@test/support'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, givenWorkspace } from '@test/support'
import { DomainEventRepository } from '@codedm/core-typescript'
import { ClassificationMethod, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { MessageClassifiedEvent } from '@codedm/contracts-typescript/wire/events'
import { OPERATOR_ID } from '@auth/operator'
import { TranscriptRepository } from '@thread/repositories/TranscriptRepository'
import { RunTerminalSessionOnClassification } from './RunTerminalSessionOnClassification'
import { TerminalSessionStartedEvent } from '../events/TerminalSessionStartedEvent'
import { TerminalSessionCompletedEvent } from '../events/TerminalSessionCompletedEvent'

/**
 * The phase-6b saga-closer against REAL repos (integration): the frozen
 * `integration.message.classified` fact resolves thread/workspace/provider + the prompt from the
 * transcript read seam, mints the issueId per the decision, and invokes `RunTerminalSession` — whose
 * (stubbed) run persists the `terminal.*` execution facts the bridge republishes.
 */
describe('RunTerminalSessionOnClassification (saga closer)', () => {
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

	async function seedClassifiedEntry(): Promise<{ threadId: string; entryId: string }> {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })
		const entry = await testBed.resolve(TranscriptRepository).append({
			ownerId: OPERATOR_ID,
			threadId: thread.id.value,
			kind: TranscriptKind.CONTACT,
			text: 'fix the coupon focus bug',
			senderExternalId: 'stranger-42',
		})
		return { threadId: thread.id.value, entryId: entry.entryId }
	}

	const classified = (threadId: string, entryId: string, issueId?: string) =>
		new MessageClassifiedEvent({
			ownerId: OPERATOR_ID,
			payload: { threadId, entryId, method: issueId ? ClassificationMethod.CONTEXT_MATCH : ClassificationMethod.NEW_ISSUE, issueId },
		})

	it('a NEW_ISSUE classification mints an issue (slug key) and runs the session → opened + completed facts', async () => {
		const { threadId, entryId } = await seedClassifiedEntry()

		await testBed.resolve(RunTerminalSessionOnClassification).handle(classified(threadId, entryId) as never)

		const started = await testBed.resolve(DomainEventRepository).findByType(TerminalSessionStartedEvent)
		expect(started).toHaveLength(1)
		expect(started[0]?.payload.threadId).toBe(threadId)
		// The minted key is a thread-unique slug.
		expect(started[0]?.payload.key).toMatch(/^[a-z0-9-]+$/)
		expect(await testBed.resolve(DomainEventRepository).findByType(TerminalSessionCompletedEvent)).toHaveLength(1)
	})

	it('drops (no-op) a fact whose thread cannot be resolved', async () => {
		const { entryId } = await seedClassifiedEntry()

		await testBed
			.resolve(RunTerminalSessionOnClassification)
			.handle(classified(testId('run-on-classification', 'ghost-thread'), entryId) as never)

		expect(await testBed.resolve(DomainEventRepository).findByType(TerminalSessionStartedEvent)).toHaveLength(0)
	})
})
