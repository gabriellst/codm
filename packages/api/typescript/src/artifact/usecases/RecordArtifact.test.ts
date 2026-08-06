import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread } from '@test/support'
import { BaseError, DomainEventRepository } from '@codm/core-typescript'
import { ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { RecordArtifact } from './RecordArtifact'
import { ListArtifacts } from './ListArtifacts'
import { ArtifactRecordedEvent } from '../events'

describe('RecordArtifact / ListArtifacts', () => {
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

	it('records an artifact + emits artifact.recorded; lists it', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const out = await testBed.resolve(RecordArtifact).execute({
			ownerId: OPERATOR_ID,
			threadId: thread.id.value,
			kind: ArtifactKind.LINK,
			name: 'acme-pr-214.vercel.app',
			ref: 'https://acme-pr-214.vercel.app',
			meta: 'Preview deploy · 2 min ago',
		})
		expect(out.artifactId).toBeDefined()

		const events = await testBed.resolve(DomainEventRepository).findByType(ArtifactRecordedEvent)
		expect(events).toHaveLength(1)

		const list = await testBed.resolve(ListArtifacts).execute({ ownerId: OPERATOR_ID, threadId: thread.id.value })
		expect(list.artifacts).toHaveLength(1)
		expect(list.artifacts[0]!.kind).toBe(ArtifactKind.LINK)
		// The field that used to be withheld. For a LINK it IS the artifact — without it the console
		// has a name and no way to reach what it names.
		expect(list.artifacts[0]!.ref).toBe('https://acme-pr-214.vercel.app')
	})

	// The two media kinds the contract gained so the console could dispatch a PLAYER on the
	// discriminant instead of guessing one from the ref's extension. Nothing in the write path knows
	// about them by name — `z.enum(ArtifactKind)` widened the instant the contract regenerated — so
	// what this pins is that the CHECK constraint recreated by migration 0012 admits them, which is
	// the only place the two new members could still be rejected.
	it.each([ArtifactKind.AUDIO, ArtifactKind.VIDEO])('records a %s artifact and reads it back', async kind => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await testBed.resolve(RecordArtifact).execute({
			ownerId: OPERATOR_ID,
			threadId: thread.id.value,
			kind,
			name: `capture.${kind.toLowerCase()}`,
			ref: `/tmp/capture.${kind === ArtifactKind.AUDIO ? 'm4a' : 'mp4'}`,
			meta: '',
		})

		const list = await testBed.resolve(ListArtifacts).execute({ ownerId: OPERATOR_ID, threadId: thread.id.value })
		expect(list.artifacts).toHaveLength(1)
		expect(list.artifacts[0]!.kind).toBe(kind)
	})

	it('rejects an unknown thread (THREAD_NOT_FOUND)', async () => {
		await expect(
			testBed.resolve(RecordArtifact).execute({
				ownerId: OPERATOR_ID,
				threadId: '00000000-0000-4000-8000-0000000000ee',
				kind: ArtifactKind.IMAGE,
				name: 'x.png',
				ref: '/tmp/x.png',
				meta: 'Screenshot',
			}),
		).rejects.toThrow(BaseError)
	})
})
