import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { ContactKind, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenRemote, givenRemoteMembership, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { SetParticipantInvocation } from '../usecases/ConfigureThreadSettings'
import { Thread } from './Thread'

const MEMBER = '5511900000041@s.whatsapp.net'

/**
 * INVARIANT (participant-permission-posture, Decision 2 / AC-2): a participant ADMITTED to the roster —
 * a live group member the JSON never recorded — enters WITHOUT elevation, whatever the caller handed in.
 * Elevation is only ever an explicit operator grant.
 *
 * FALSIFIER: in `Thread.admitParticipant`, write `{ canElevate: false, ...participant }` (spread AFTER the
 * default) and the smuggled-grant case goes RED.
 */
describe('INVARIANT — an admitted member enters without elevation', () => {
	const base = {
		ownerId: '00000000-0000-4000-8000-000000000001',
		channelId: '00000000-0000-4000-8000-0000000000aa',
		contactRef: { externalId: 'g1', displayName: 'Grupo', kind: ContactKind.GROUP },
		workspaceId: '00000000-0000-4000-8000-0000000000bb',
		providers: [ProviderKind.CLAUDE_CODE],
		mentionTag: '@base',
		participants: [{ participantId: 'operator', name: 'Operator', source: 'Mac', canInvoke: true, canElevate: true }],
	}

	it('a caller that smuggles canElevate=true still admits the member with false', () => {
		const thread = Thread.create(base)
		// Assigned to a variable first: the parameter type does not accept the key, and this is exactly the
		// runtime shape a careless caller could still hand over.
		const smuggled = { participantId: MEMBER, name: MEMBER, source: 'Channel group member', canInvoke: false, canElevate: true }

		thread.admitParticipant(smuggled)

		expect(thread.participants.find(p => p.participantId === MEMBER)?.canElevate).toBe(false)
	})

	it('admitting an id already on the roster changes nothing — the existing grant stands', () => {
		const thread = Thread.create(base)

		thread.admitParticipant({ participantId: 'operator', name: 'Operator', source: 'Mac', canInvoke: true })

		expect(thread.participants.find(p => p.participantId === 'operator')?.canElevate).toBe(true)
	})

	describe('through the use case that admits (SetParticipantInvocation)', () => {
		let testBed: TestBed
		let testContainer: DependencyContainer
		const GROUP_CHANNEL = '019e4d24-0000-7041-9e1c-0000000000a1'
		const GROUP_ID = '120363333333333333@g.us'

		beforeAll(async () => {
			testContainer = container.createChildContainer()
			testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		})
		beforeEach(async () => {
			await testBed.reset()
		})
		afterAll(async () => {
			await testBed.destroy()
		})

		it('granting INVOCATION to a live member admits them without ELEVATION', async () => {
			await givenRemote(testBed, { channelId: GROUP_CHANNEL, remoteId: GROUP_ID, type: ContactKind.GROUP, name: 'BK DASH BOT' })
			const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
			const thread = await givenThread(testBed, {
				ownerId: MOCK_CLOUD_OWNER_ID,
				workspaceId: workspace.id.value,
				channelId: GROUP_CHANNEL,
				contactExternalId: GROUP_ID,
				contactKind: ContactKind.GROUP,
				participants: [
					{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true, canElevate: true },
				],
			})
			await givenRemoteMembership(testBed, { channelId: GROUP_CHANNEL, groupId: GROUP_ID, memberId: MEMBER })

			await testBed
				.resolve(SetParticipantInvocation)
				.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: MEMBER, canInvoke: true })

			const member = (await testBed.resolve(ThreadRepository).findById(thread.id.value))?.participants.find(p => p.participantId === MEMBER)
			expect(member?.canInvoke).toBe(true)
			expect(member?.canElevate).toBe(false)
		})
	})
})
