import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenRemote, givenRemoteMembership, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ContactKind } from '@codm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ConfigureThinkingIndicator, SetParticipantInvocation } from './ConfigureThreadSettings'

const GROUP_CHANNEL = '019e4d24-0000-7041-9e1c-0000000000e1'
const GROUP_ID = '120363111111111111@g.us'
const MEMBER_A = '5511900000011@s.whatsapp.net'
const STRANGER = '5511900000000@s.whatsapp.net'

/**
 * The write-side counterpart of the `GetThreadSettings` roster join (see that suite's header). A live
 * group member the JSON has never recorded now RENDERS a toggle — this suite proves flipping it does
 * not explode with `PARTICIPANT_NOT_FOUND`, that the admission door stays shut for anyone who is
 * neither on the JSON roster nor a live member, and that `LAST_INVOKER` still holds once a thread has
 * exactly one invoker.
 */
describe('SetParticipantInvocation — admits a live group member the JSON roster has never recorded', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

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

	const givenGroup = async () =>
		givenRemote(testBed, { channelId: GROUP_CHANNEL, remoteId: GROUP_ID, type: ContactKind.GROUP, name: 'DEMO SHOP BOT' })

	const groupThread = async () => {
		await givenGroup()
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		return givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			channelId: GROUP_CHANNEL,
			contactExternalId: GROUP_ID,
			contactKind: ContactKind.GROUP,
			// The operator is the only JSON entry — MEMBER_A is live in the gateway but the JSON has
			// never heard of them, exactly the shape GetThreadSettings' join now renders a toggle for.
			participants: [{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true }],
		})
	}

	it('toggling ON a live member absent from the JSON roster PERSISTS instead of throwing PARTICIPANT_NOT_FOUND', async () => {
		const thread = await groupThread()
		await givenRemoteMembership(testBed, { channelId: GROUP_CHANNEL, groupId: GROUP_ID, memberId: MEMBER_A })

		await testBed
			.resolve(SetParticipantInvocation)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: MEMBER_A, canInvoke: true })

		const persisted = await testBed.resolve(ThreadRepository).findById(thread.id.value)
		const member = persisted?.participants.find(p => p.participantId === MEMBER_A)
		expect(member?.canInvoke).toBe(true)
	})

	it('an id that is neither on the JSON roster nor a live group member is still refused (PARTICIPANT_NOT_FOUND)', async () => {
		const thread = await groupThread()
		await givenRemoteMembership(testBed, { channelId: GROUP_CHANNEL, groupId: GROUP_ID, memberId: MEMBER_A })

		// STRANGER is neither in the JSON nor in gateway_remote_memberships — the admission door must
		// stay shut, or any id could be granted invocation rights by simply posting it once.
		await expect(
			testBed
				.resolve(SetParticipantInvocation)
				.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: STRANGER, canInvoke: true }),
		).rejects.toThrow(expect.objectContaining({ name: 'PARTICIPANT_NOT_FOUND' }))
	})

	it('LAST_INVOKER still locks — the sole invoker cannot be toggled off even with the live roster hydrated', async () => {
		const thread = await groupThread()
		await givenRemoteMembership(testBed, { channelId: GROUP_CHANNEL, groupId: GROUP_ID, memberId: MEMBER_A })

		// The operator is the thread's only invoker (`canInvoke: true`); MEMBER_A is admitted at
		// `canInvoke: false` by default, so they never contend for the last slot.
		await expect(
			testBed
				.resolve(SetParticipantInvocation)
				.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: 'operator', canInvoke: false }),
		).rejects.toThrow(expect.objectContaining({ name: 'LAST_INVOKER' }))
	})
})

describe('ConfigureThinkingIndicator — per-thread on/off for the "Pensando" channel placeholder', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

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

	it('turns it off and persists the flip', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		expect(thread.thinkingIndicatorEnabled).toBe(true)

		await testBed
			.resolve(ConfigureThinkingIndicator)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, enabled: false })

		const persisted = await testBed.resolve(ThreadRepository).findById(thread.id.value)
		expect(persisted?.thinkingIndicatorEnabled).toBe(false)
	})

	it('turns it back on', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const useCase = testBed.resolve(ConfigureThinkingIndicator)
		await useCase.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, enabled: false })

		await useCase.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, enabled: true })

		const persisted = await testBed.resolve(ThreadRepository).findById(thread.id.value)
		expect(persisted?.thinkingIndicatorEnabled).toBe(true)
	})

	it('refuses a thread that does not belong to the caller (THREAD_NOT_FOUND)', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		await expect(
			testBed
				.resolve(ConfigureThinkingIndicator)
				.execute({ ownerId: '00000000-0000-4000-8000-000000000099', threadId: thread.id.value, enabled: false }),
		).rejects.toThrow(expect.objectContaining({ name: 'THREAD_NOT_FOUND' }))
	})
})
