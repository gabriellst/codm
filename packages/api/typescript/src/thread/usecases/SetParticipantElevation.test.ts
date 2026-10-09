import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { BaseError } from '@codm/core-typescript'
import { ContactKind, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenRemote, givenRemoteMembership, givenThread, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ChannelConnectivity } from '../services/ChannelConnectivity'
import { SetParticipantElevationController } from '../controllers/SetParticipantElevation'
import { AttachThread } from './AttachThread'
import { GetThreadSettings } from './GetThreadSettings'
import { SetParticipantElevation } from './ConfigureThreadSettings'

const GROUP_CHANNEL = '019e4d24-0000-7041-9e1c-0000000000f1'
const GROUP_ID = '120363222222222222@g.us'
const MEMBER_A = '5511900000021@s.whatsapp.net'
const MEMBER_B = '5511900000022@s.whatsapp.net'

/**
 * AC-2 / AC-3 (participant-permission-posture spec) — `canElevate` is a per-participant, per-thread
 * grant the operator controls. The operator is born with it, every member without it, and the
 * console door persists a flip, refuses an unknown participant, and admits a live group member the
 * JSON roster never recorded (the same admission `SetParticipantInvocation` already has).
 */
describe('SetParticipantElevation — who may run turns with no permission filter', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		testBed.override(ChannelConnectivity, { isConnected: async () => true, anyConnected: async () => true } as ChannelConnectivity)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const settingsFor = (threadId: string) => testBed.resolve(GetThreadSettings).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId })

	const groupThread = async () => {
		await givenRemote(testBed, { channelId: GROUP_CHANNEL, remoteId: GROUP_ID, type: ContactKind.GROUP, name: 'BK DASH BOT' })
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		return givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			channelId: GROUP_CHANNEL,
			contactExternalId: GROUP_ID,
			contactKind: ContactKind.GROUP,
			participants: [
				{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true, canElevate: true },
				{ participantId: MEMBER_A, name: MEMBER_A, source: 'Channel group member', canInvoke: true, canElevate: false },
			],
		})
	}

	it('AC-2 — AttachThread seeds the operator WITH elevation and every group member WITHOUT', async () => {
		// The membership rows reference the group's remote — it must exist before they do.
		await givenRemote(testBed, { channelId: GROUP_CHANNEL, remoteId: GROUP_ID, type: ContactKind.GROUP, name: 'BK DASH BOT' })
		await givenRemoteMembership(testBed, { channelId: GROUP_CHANNEL, groupId: GROUP_ID, memberId: MEMBER_A })
		await givenRemoteMembership(testBed, { channelId: GROUP_CHANNEL, groupId: GROUP_ID, memberId: MEMBER_B })
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		const out = await testBed.resolve(AttachThread).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			contactRef: { channelId: GROUP_CHANNEL, externalId: GROUP_ID, displayName: 'BK DASH BOT', kind: ContactKind.GROUP },
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})

		const thread = await testBed.resolve(ThreadRepository).findById(out.threadId)
		const byId = new Map(thread?.participants.map(p => [p.participantId, p.canElevate]))
		expect(byId.get('operator')).toBe(true)
		expect(byId.get(MEMBER_A)).toBe(false)
		expect(byId.get(MEMBER_B)).toBe(false)
	})

	it('AC-2 — a 1:1 thread seeds the counterparty WITHOUT elevation', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const out = await testBed.resolve(AttachThread).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			contactRef: { channelId: GROUP_CHANNEL, externalId: 'contact-1', displayName: 'Ada', kind: ContactKind.USER },
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})

		const thread = await testBed.resolve(ThreadRepository).findById(out.threadId)
		expect(thread?.participants.find(p => p.participantId === 'contact-1')?.canElevate).toBe(false)
		expect(thread?.participants.find(p => p.participantId === 'operator')?.canElevate).toBe(true)
	})

	it('AC-3 — granting a member persists, and the settings read reflects it on reopen', async () => {
		const thread = await groupThread()
		await givenRemoteMembership(testBed, { channelId: GROUP_CHANNEL, groupId: GROUP_ID, memberId: MEMBER_A })

		await testBed
			.resolve(SetParticipantElevation)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: MEMBER_A, canElevate: true })

		const reloaded = await testBed.resolve(ThreadRepository).findById(thread.id.value)
		expect(reloaded?.participants.find(p => p.participantId === MEMBER_A)?.canElevate).toBe(true)
		const settings = await settingsFor(thread.id.value)
		expect(settings.participants.find(p => p.participantId === MEMBER_A)?.canElevate).toBe(true)
		expect(settings.participants.find(p => p.participantId === 'operator')?.canElevate).toBe(true)
	})

	it('AC-3 — an id that is neither on the roster nor a live member is refused with PARTICIPANT_NOT_FOUND', async () => {
		const thread = await groupThread()

		const failure = await testBed
			.resolve(SetParticipantElevation)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: 'stranger@s.whatsapp.net', canElevate: true })
			.then(
				() => undefined,
				(error: unknown) => error as BaseError,
			)

		expect(failure?.name).toBe('PARTICIPANT_NOT_FOUND')
	})

	it('admits a LIVE group member the JSON roster never recorded, then grants it', async () => {
		const thread = await groupThread()
		await givenRemoteMembership(testBed, { channelId: GROUP_CHANNEL, groupId: GROUP_ID, memberId: MEMBER_B })

		await testBed
			.resolve(SetParticipantElevation)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: MEMBER_B, canElevate: true })

		const reloaded = await testBed.resolve(ThreadRepository).findById(thread.id.value)
		const admitted = reloaded?.participants.find(p => p.participantId === MEMBER_B)
		expect(admitted?.canElevate).toBe(true)
		// Admission does not grant INVOCATION — the two axes stay independent.
		expect(admitted?.canInvoke).toBe(false)
	})

	it('canElevate is independent of canInvoke — the operator may drop elevation and keep invoking', async () => {
		const thread = await groupThread()

		await testBed
			.resolve(SetParticipantElevation)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, participantId: 'operator', canElevate: false })

		const operator = (await testBed.resolve(ThreadRepository).findById(thread.id.value))?.participants.find(
			p => p.participantId === 'operator',
		)
		expect(operator?.canElevate).toBe(false)
		expect(operator?.canInvoke).toBe(true)
	})

	it('the console door answers 204 and writes through the use case', async () => {
		const thread = await groupThread()

		const response = await testBed.resolve(SetParticipantElevationController).handle({
			url: `/threads/${thread.id.value}/participants/${MEMBER_A}/elevation`,
			raw: new Request(`http://localhost/threads/${thread.id.value}/participants/${MEMBER_A}/elevation`, { method: 'PUT' }),
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID },
			params: { threadId: thread.id.value, participantId: MEMBER_A },
			body: { canElevate: true },
		})

		expect(response.status).toBe(204)
		const reloaded = await testBed.resolve(ThreadRepository).findById(thread.id.value)
		expect(reloaded?.participants.find(p => p.participantId === MEMBER_A)?.canElevate).toBe(true)
	})
})
