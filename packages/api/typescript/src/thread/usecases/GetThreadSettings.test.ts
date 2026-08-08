import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenRemote, givenRemoteMembership, givenThread, givenWorkspace } from '@test/support'
import { OPERATOR_ID } from '@auth/operator'
import { ContactKind } from '@codm/contracts-typescript/wire/enums'
import { CUSTOM_PROMPT_MAX_LENGTH } from '../schemas'
import { ConfigurePrompt } from './ConfigureThreadSettings'
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

	const contact = (remoteId: string, name: string, avatarUrl?: string) =>
		givenRemote(testBed, { channelId: CHANNEL, remoteId, name, avatarUrl })

	const PHOTO_URL = 'https://pps.whatsapp.net/v/t61.24694-24/gabriel.jpg'

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

	/**
	 * THE CUSTOM PROMPT SURVIVES THE ROUND TRIP — entity → column → entity → DTO.
	 *
	 * Asserted end-to-end rather than on `configurePrompt` alone because every one of those hops is a
	 * place the value can be dropped SILENTLY: a column missing from the repository's `onConflictDoUpdate`
	 * set writes nothing and reports success, and a DTO that forgets the field renders an empty box over
	 * a stored prompt the agent is still obeying. Both failures look identical from the console — "my
	 * prompt did not save" — and neither makes anything red.
	 */
	it('round-trips the operator custom prompt, and reports the cap the console counts down to', async () => {
		const thread = await threadWithContact(JID)
		const configure = testBed.resolve(ConfigurePrompt)

		await configure.execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, customPrompt: 'Fale sempre em inglês com este cliente.' })

		const settings = await settingsFor(thread.id.value)
		expect(settings.customPrompt).toBe('Fale sempre em inglês com este cliente.')
		expect(settings.customPromptMaxLength).toBe(CUSTOM_PROMPT_MAX_LENGTH)
	})

	/**
	 * CLEARING has to reach the database too. This is the half a missing `onConflictDoUpdate` entry
	 * breaks most cruelly: the console shows the box empty (it echoes what was typed), and the agent
	 * keeps obeying an instruction the operator can no longer see anywhere.
	 */
	it('an empty prompt ERASES the stored one', async () => {
		const thread = await threadWithContact(JID)
		const configure = testBed.resolve(ConfigurePrompt)
		await configure.execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, customPrompt: 'Nunca prometa prazo.' })

		await configure.execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, customPrompt: '' })

		expect((await settingsFor(thread.id.value)).customPrompt).toBe('')
	})

	/** Never written ⇒ the empty string, not `undefined` — the read is consumed by a textarea. */
	it('reports an empty prompt when the operator never wrote one', async () => {
		const thread = await threadWithContact(JID)
		expect((await settingsFor(thread.id.value)).customPrompt).toBe('')
	})

	/**
	 * THE FACE, alongside the name — the roster is where the founder first noticed their own row
	 * rendering as initials while `gateway_remotes` plainly held a photo for that JID.
	 *
	 * `hasAvatar`, never the url: the console composes the daemon's own address from `channelId` +
	 * `participantId`, and the platform's signed url must not cross the wire (rail DSK-12).
	 */
	it('flags the member who HAS a photo, and hands the console the channel to fetch it from', async () => {
		const thread = await threadWithContact(JID)
		await contact(JID, 'Gabriel Araújo', PHOTO_URL)

		const { participants } = await settingsFor(thread.id.value)

		const member = participants.find(p => p.participantId === JID)
		expect(member?.hasAvatar).toBe(true)
		expect(member?.channelId).toBe(CHANNEL)
	})

	/**
	 * DEGRADES TO INITIALS, never breaks. A JID with no entry in the contact book — the fresh group
	 * member, the remote the Go sync has not written yet — still renders: a name (the roster's) and
	 * `hasAvatar: false`, which is what the console draws initials from.
	 */
	it('a JID absent from the contact book reports no photo instead of failing', async () => {
		const thread = await threadWithContact(JID)

		const { participants } = await settingsFor(thread.id.value)

		const member = participants.find(p => p.participantId === JID)
		expect(member?.hasAvatar).toBe(false)
		expect(member?.name).toBe(ROSTER_NAME)
	})

	/** A synced contact whose photo the platform has never published is the same case as an absent one. */
	it('a known contact with no photo reports no photo', async () => {
		const thread = await threadWithContact(JID)
		await contact(JID, 'Gabriel Araújo')

		const { participants } = await settingsFor(thread.id.value)

		expect(participants.find(p => p.participantId === JID)?.hasAvatar).toBe(false)
	})

	/** The operator sentinel is a WORD, not a JID — no contact book entry, so no face, and no crash. */
	it('the operator row reports no photo', async () => {
		const thread = await threadWithContact(JID)
		await contact(JID, 'Gabriel Araújo', PHOTO_URL)

		const { participants } = await settingsFor(thread.id.value)

		expect(participants.find(p => p.participantId === 'operator')?.hasAvatar).toBe(false)
	})

	/** A contact of ANOTHER channel with the same JID must not leak in — the key is (channel, remote). */
	it('does not borrow a name from a different channel', async () => {
		const thread = await threadWithContact(JID)
		await givenRemote(testBed, { channelId: '019e4d24-0000-7041-9e1c-0000000000c2', remoteId: JID, name: 'Someone Else' })

		const { participants } = await settingsFor(thread.id.value)

		expect(participants.find(p => p.participantId === JID)?.name).toBe(ROSTER_NAME)
	})
})

/**
 * The roster's WHO now comes from the LIVE `gateway_remote_memberships` projection for a GROUP thread,
 * not from `thread_threads.participants` — the JSON snapshot `AttachThread` freezes at bind time and
 * nobody rewrites when the gateway reprojects membership afterwards.
 *
 * Measured on the founder's own base, group "BK DASH BOT": `gateway_remote_memberships` had 4 members,
 * the JSON roster only ever recorded 3 — Carlos Almeida's row never rendered, so the operator could
 * not grant him invocation rights. This suite proves the join fixes exactly that class of miss, and
 * that it does not regress the two cases the join could break: a 1:1 thread (no membership rows at
 * all) and a member who has genuinely left the group.
 */
describe('GetThreadSettings — group roster reflects LIVE membership, not the frozen JSON snapshot', () => {
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

	const GROUP_CHANNEL = '019e4d24-0000-7041-9e1c-0000000000d1'
	const GROUP_ID = '120363000000000000@g.us'
	const MEMBER_A = '5513996493030@s.whatsapp.net'
	const MEMBER_B = '558393047676@s.whatsapp.net'

	const settingsFor = async (threadId: string) => testBed.resolve(GetThreadSettings).execute({ ownerId: OPERATOR_ID, threadId })

	const givenGroup = async () =>
		givenRemote(testBed, { channelId: GROUP_CHANNEL, remoteId: GROUP_ID, type: ContactKind.GROUP, name: 'BK DASH BOT' })

	it('a member the live membership projection knows about, absent from the JSON roster, APPEARS', async () => {
		await givenGroup()
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, {
			ownerId: OPERATOR_ID,
			workspaceId: workspace.id.value,
			channelId: GROUP_CHANNEL,
			contactExternalId: GROUP_ID,
			contactKind: ContactKind.GROUP,
			// The JSON roster the operator's dialog would otherwise be stuck with — no MEMBER_A row at all.
			participants: [{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true }],
		})
		await givenRemoteMembership(testBed, { channelId: GROUP_CHANNEL, groupId: GROUP_ID, memberId: MEMBER_A })

		const { participants } = await settingsFor(thread.id.value)

		const member = participants.find(p => p.participantId === MEMBER_A)
		expect(member).toBeDefined()
		// New to the JSON ⇒ defaults to NOT invoking, same default a fresh AttachThread seeds.
		expect(member?.canInvoke).toBe(false)
	})

	it('a member the JSON roster still lists, but who has LEFT the group, disappears', async () => {
		await givenGroup()
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, {
			ownerId: OPERATOR_ID,
			workspaceId: workspace.id.value,
			channelId: GROUP_CHANNEL,
			contactExternalId: GROUP_ID,
			contactKind: ContactKind.GROUP,
			participants: [
				{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true },
				{ participantId: MEMBER_A, name: MEMBER_A, source: 'Channel group member', canInvoke: false },
				{ participantId: MEMBER_B, name: MEMBER_B, source: 'Channel group member', canInvoke: false },
			],
		})
		// Only MEMBER_A is still live in the gateway projection — MEMBER_B left the group.
		await givenRemoteMembership(testBed, { channelId: GROUP_CHANNEL, groupId: GROUP_ID, memberId: MEMBER_A })

		const { participants } = await settingsFor(thread.id.value)

		expect(participants.find(p => p.participantId === MEMBER_A)).toBeDefined()
		expect(participants.find(p => p.participantId === MEMBER_B)).toBeUndefined()
	})

	it('a 1:1 thread (no membership rows exist for it) keeps reading the JSON roster unchanged', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, {
			ownerId: OPERATOR_ID,
			workspaceId: workspace.id.value,
			channelId: GROUP_CHANNEL,
			contactExternalId: JID,
			contactKind: ContactKind.USER,
		})

		const { participants } = await settingsFor(thread.id.value)

		expect(participants.map(p => p.participantId).sort()).toEqual(['operator', JID].sort())
	})
})
