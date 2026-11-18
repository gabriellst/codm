import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { ContactKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenChannel, givenIssue, givenRemote, givenRemoteMembership, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ChannelSender, type MockChannelSender } from '../services/ChannelSender'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { PanelRosterRelay, type MockPanelRosterRelay } from '../services/PanelRosterRelay'
import { PanelMemberKey } from '../services/PanelMemberKey'
import { PublishPanelRoster } from './PublishPanelRoster'

// Neutral fixtures: made-up addresses that only LOOK like WhatsApp ids, so a leak is detectable.
const GROUP_JID = '120300000000000001@g.us'
const OWNER_JID = '5500000000001@s.whatsapp.net'
const ANA_JID = '5500000000002@s.whatsapp.net'
const BETO_JID = '5500000000003@s.whatsapp.net'
const NAMELESS_JID = '5500000000004@s.whatsapp.net'
const PHONE_NAMED_JID = '5500000000005@s.whatsapp.net'

/**
 * THE PEOPLE-SIDE PULL (fase 2, item 6a). The daemon tells the cloud panel who is in each group —
 * opaque ids, real contact names, the "pode liberar" grant — and delivers the codes the cloud hands back
 * by WhatsApp DM to exactly that person.
 *
 * Falsifiers: send the JID as memberId, or fall back to the roster's stored name, and the leak check
 * fails; look the member up by name instead of by id and the DM goes to the wrong person; route the DM
 * through the command queue and a row (holding the plain code) appears in `scheduled_commands`.
 */
describe('PublishPanelRoster', () => {
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

	const relay = () => testBed.resolve(PanelRosterRelay) as MockPanelRosterRelay
	const sender = () => testBed.resolve(ChannelSender) as MockChannelSender
	const run = () => testBed.resolve(PublishPanelRoster).execute({})

	const givenGroup = async () => {
		const { channelId } = await givenChannel(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, ownerRemoteId: OWNER_JID })
		await givenRemote(testBed, { channelId, remoteId: GROUP_JID, name: 'Equipe', type: ContactKind.GROUP })
		await givenRemote(testBed, { channelId, remoteId: OWNER_JID, name: 'Dona' })
		await givenRemote(testBed, { channelId, remoteId: ANA_JID, name: 'Ana' })
		await givenRemote(testBed, { channelId, remoteId: BETO_JID, name: 'Beto' })
		await givenRemote(testBed, { channelId, remoteId: NAMELESS_JID, name: '' })
		await givenRemote(testBed, { channelId, remoteId: PHONE_NAMED_JID, name: '+55 00 00000-0005' })
		for (const memberId of [OWNER_JID, ANA_JID, BETO_JID, NAMELESS_JID, PHONE_NAMED_JID]) {
			await givenRemoteMembership(testBed, { channelId, groupId: GROUP_JID, memberId })
		}
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			channelId,
			contactExternalId: GROUP_JID,
			contactKind: ContactKind.GROUP,
			participants: [
				{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true, canElevate: true },
				{ participantId: ANA_JID, name: ANA_JID, source: 'Channel group member', canInvoke: true, canElevate: true },
				{ participantId: BETO_JID, name: BETO_JID, source: 'Channel group member', canInvoke: true, canElevate: false },
				// The roster JSON often stores the bare JID as the name — it must never be what the cloud sees.
				{ participantId: NAMELESS_JID, name: NAMELESS_JID, source: 'Channel group member', canInvoke: false, canElevate: false },
			],
		})
		await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-1' })
		return { channelId, threadId: thread.id.value }
	}

	it('sends opaque member ids, real names and the release grant — and no phone number or JID at all', async () => {
		const { threadId } = await givenGroup()
		// A conversation with no issue has no board, so its people are not sent.
		await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			contactKind: ContactKind.GROUP,
			contactExternalId: '120300000000000009@g.us',
		})

		expect(await run()).toEqual({ sent: true, groups: 1, delivered: 0, acted: 0 })
		const batch = relay().batches.at(-1)
		const key = testBed.resolve(PanelMemberKey)
		expect(batch?.groups).toEqual([
			{
				threadId,
				members: expect.arrayContaining([
					// The owner's own number IS the operator on the channel — it inherits the operator's grant.
					{ memberId: key.memberIdOf(threadId, OWNER_JID), name: 'Dona', canRelease: true },
					{ memberId: key.memberIdOf(threadId, ANA_JID), name: 'Ana', canRelease: true },
					{ memberId: key.memberIdOf(threadId, BETO_JID), name: 'Beto', canRelease: false },
				]),
				openStops: [],
			},
		])
		expect(batch?.groups[0]?.members).toHaveLength(3)
		for (const member of batch?.groups[0]?.members ?? []) expect(member.memberId).toMatch(/^[A-Za-z0-9_-]{22}$/)

		const wire = JSON.stringify(relay().batches)
		expect(wire).not.toContain('@')
		expect(wire).not.toMatch(/5500000000/)
		expect(wire).not.toContain('operator')
	})

	it('delivers a pulled code by DM to exactly that member, claims the echo, and stores the code nowhere', async () => {
		const { channelId, threadId } = await givenGroup()
		const key = testBed.resolve(PanelMemberKey)
		relay().pending = [
			{ requestId: '019e4d24-6524-7041-9e1c-8108180cde40', threadId, memberId: key.memberIdOf(threadId, BETO_JID), code: '482913' },
			// A member the roster no longer has (left the group between request and pull): nothing is sent.
			{ requestId: '019e4d24-6524-7041-9e1c-8108180cde41', threadId, memberId: 'AAAAAAAAAAAAAAAAAAAAAA', code: '111111' },
		]

		const before = sender().sent.length
		const stored = await testBed.probe().snapshot(['scheduledCommands', 'transcriptEntries', 'events'] as const)
		expect(await run()).toEqual({ sent: true, groups: 1, delivered: 1, acted: 0 })
		expect(sender().sent).toHaveLength(before + 1)
		const dm = sender().sent.at(-1)
		expect(dm).toEqual(expect.objectContaining({ channelId, remoteId: BETO_JID, ownerId: MOCK_CLOUD_OWNER_ID }))
		expect(dm?.text).toBe('Seu código do painel do codm: 482913 — vale 10 min.')
		expect(await testBed.resolve(ConsumedMessageRepository).has(channelId, dm?.messageId ?? '')).toBe(true)

		// Straight to the channel: no command row (which would hold the plain code), no transcript entry, no fact.
		expect(await testBed.probe().snapshot(['scheduledCommands', 'transcriptEntries', 'events'] as const)).toEqual(stored)
	})

	it('not logged in: nothing sent, nothing delivered', async () => {
		const { threadId } = await givenGroup()
		const before = sender().sent.length
		relay().offline = true
		relay().pending = [{ requestId: '019e4d24-6524-7041-9e1c-8108180cde42', threadId, memberId: 'AAAAAAAAAAAAAAAAAAAAAA', code: '222222' }]
		expect(await run()).toEqual({ sent: false, groups: 1, delivered: 0, acted: 0 })
		expect(sender().sent).toHaveLength(before)
		relay().pending = []
		relay().offline = false
	})
})
