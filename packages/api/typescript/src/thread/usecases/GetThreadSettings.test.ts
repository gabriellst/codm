import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenRemote, givenThread, givenWorkspace } from '@test/support'
import { OPERATOR_ID } from '@auth/operator'
import { GetThreadSettings } from './GetThreadSettings'

const CHANNEL = '019e4d24-0000-7041-9e1c-0000000000c1'
const JID = '558386387518@s.whatsapp.net'
/** What `givenThread` stores in the roster — the fixture's stand-in for whatever the group snapshot
 *  supplied. In production that value is the bare JID, which is the whole reason this resolution exists. */
const ROSTER_NAME = 'Test Contact'

/**
 * The settings dialog lists WHO can invoke, and it listed them by raw WhatsApp JID — the roster stores
 * whatever the group snapshot supplied at attach time, and for a member that is the bare
 * `5583…@s.whatsapp.net`. The gateway's contact book already knew the person's name; nothing joined the
 * two, so the operator had to recognise their friends by phone number.
 */
describe('GetThreadSettings — participant names come from the contact book', () => {
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

	const threadWithContact = async (contactExternalId: string) => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		return givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value, channelId: CHANNEL, contactExternalId })
	}

	const contact = (remoteId: string, name: string) => givenRemote(testBed, { channelId: CHANNEL, remoteId, name })

	const settingsFor = async (threadId: string) => testBed.resolve(GetThreadSettings).execute({ ownerId: OPERATOR_ID, threadId })

	it('renders the contact NAME where the roster only had a JID', async () => {
		const thread = await threadWithContact(JID)
		await contact(JID, 'Gabriel Araújo')

		const { participants } = await settingsFor(thread.id.value)

		const member = participants.find(p => p.participantId === JID)
		expect(member?.name).toBe('Gabriel Araújo')
	})

	/**
	 * FALLBACK. A member the contact book has never seen — a fresh group participant, a synced-out
	 * remote — must still render. Showing the JID is poor, showing nothing is a bug.
	 */
	it('falls back to the stored roster name when no contact entry exists', async () => {
		const thread = await threadWithContact(JID)

		const { participants } = await settingsFor(thread.id.value)

		expect(participants.find(p => p.participantId === JID)?.name).toBe(ROSTER_NAME)
	})

	it('an EMPTY contact name does not blank the row — it falls back too', async () => {
		const thread = await threadWithContact(JID)
		await contact(JID, '')

		const { participants } = await settingsFor(thread.id.value)

		expect(participants.find(p => p.participantId === JID)?.name).toBe(ROSTER_NAME)
	})

	/** The operator is a roster id, never a WhatsApp contact — it must not be looked up or overwritten. */
	it('leaves the operator row alone', async () => {
		const thread = await threadWithContact(JID)
		await contact(JID, 'Gabriel Araújo')

		const { participants } = await settingsFor(thread.id.value)

		expect(participants.find(p => p.participantId === 'operator')?.name).toBe('Operator')
	})

	/** A contact of ANOTHER channel with the same JID must not leak in — the key is (channel, remote). */
	it('does not borrow a name from a different channel', async () => {
		const thread = await threadWithContact(JID)
		await givenRemote(testBed, { channelId: '019e4d24-0000-7041-9e1c-0000000000c2', remoteId: JID, name: 'Someone Else' })

		const { participants } = await settingsFor(thread.id.value)

		expect(participants.find(p => p.participantId === JID)?.name).toBe(ROSTER_NAME)
	})
})
