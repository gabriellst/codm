import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenRemote, givenRemoteMembership, givenThread, givenWorkspace } from '@test/support'
import { CloudSession } from '@shared/services/CloudSession'
import {
	MOCK_CLOUD_OWNER_ID,
	MOCK_CLOUD_SESSION_ID,
	MOCK_CLOUD_USER_ID,
	MockCloudSession,
} from '@shared/services/CloudSession/MockCloudSession'
import { ContactKind, Language } from '@codm/contracts-typescript/wire/enums'
import { CUSTOM_PROMPT_MAX_LENGTH } from '../schemas'
import { ConfigureLanguage, ConfigurePrompt, ConfigureThinkingIndicator } from './ConfigureThreadSettings'
import { GetThreadSettings } from './GetThreadSettings'

const CHANNEL = '019e4d24-0000-7041-9e1c-0000000000c1'
const JID = '5511900000010@s.whatsapp.net'
/** What `givenThread` stores in the roster — the fixture's stand-in for whatever the group snapshot
 *  supplied. In production that value is the bare JID, which is the whole reason this resolution exists. */
const ROSTER_NAME = 'Test Contact'

/**
 * The settings dialog lists WHO can invoke, and it listed them by raw WhatsApp JID — the roster stores
 * whatever the group snapshot supplied at attach time, and for a member that is the bare
 * `5511900000010@s.whatsapp.net`. The gateway's contact book already knew the person's name; nothing joined the
 * two, so the operator had to recognise their friends by phone number.
 */
describe('GetThreadSettings — participant names come from the contact book', () => {
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

	const threadWithContact = async (contactExternalId: string) => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		return givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value, channelId: CHANNEL, contactExternalId })
	}

	const contact = (remoteId: string, name: string, avatarUrl?: string) =>
		givenRemote(testBed, { channelId: CHANNEL, remoteId, name, avatarUrl })

	const PHOTO_URL = 'https://pps.whatsapp.net/v/t61.24694-24/ada.jpg'

	const settingsFor = async (threadId: string) => testBed.resolve(GetThreadSettings).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId })

	it('renders the contact NAME where the roster only had a JID', async () => {
		const thread = await threadWithContact(JID)
		await contact(JID, 'Diego Martins')

		const { participants } = await settingsFor(thread.id.value)

		const member = participants.find(p => p.participantId === JID)
		expect(member?.name).toBe('Diego Martins')
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
		await contact(JID, 'Diego Martins')

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

		await configure.execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			customPrompt: 'Fale sempre em inglês com este cliente.',
		})

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
		await configure.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, customPrompt: 'Nunca prometa prazo.' })

		await configure.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, customPrompt: '' })

		expect((await settingsFor(thread.id.value)).customPrompt).toBe('')
	})

	/** Never written ⇒ the empty string, not `undefined` — the read is consumed by a textarea. */
	it('reports an empty prompt when the operator never wrote one', async () => {
		const thread = await threadWithContact(JID)
		expect((await settingsFor(thread.id.value)).customPrompt).toBe('')
	})

	/** Default ON (thinking-indicator spec) — the settings modal must reflect the flip both ways. */
	it('reports the "Pensando" placeholder setting, ON by default and round-tripped after a flip', async () => {
		const thread = await threadWithContact(JID)
		expect((await settingsFor(thread.id.value)).thinkingIndicator).toEqual({ enabled: true })

		await testBed.resolve(ConfigureThinkingIndicator).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, enabled: false })

		expect((await settingsFor(thread.id.value)).thinkingIndicator).toEqual({ enabled: false })
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
		await contact(JID, 'Diego Martins', PHOTO_URL)

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
		await contact(JID, 'Diego Martins')

		const { participants } = await settingsFor(thread.id.value)

		expect(participants.find(p => p.participantId === JID)?.hasAvatar).toBe(false)
	})

	/** The operator sentinel is a WORD, not a JID — no contact book entry, so no face, and no crash. */
	it('the operator row reports no photo', async () => {
		const thread = await threadWithContact(JID)
		await contact(JID, 'Diego Martins', PHOTO_URL)

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
 * Measured on the founder's own base, group "DEMO SHOP BOT": `gateway_remote_memberships` had 4 members,
 * the JSON roster only ever recorded 3 — Eduardo Lima's row never rendered, so the operator could
 * not grant him invocation rights. This suite proves the join fixes exactly that class of miss, and
 * that it does not regress the two cases the join could break: a 1:1 thread (no membership rows at
 * all) and a member who has genuinely left the group.
 */
describe('GetThreadSettings — group roster reflects LIVE membership, not the frozen JSON snapshot', () => {
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

	const GROUP_CHANNEL = '019e4d24-0000-7041-9e1c-0000000000d1'
	const GROUP_ID = '120363000000000000@g.us'
	const MEMBER_A = '5511900000011@s.whatsapp.net'
	const MEMBER_B = '5511900000012@s.whatsapp.net'

	const settingsFor = async (threadId: string) => testBed.resolve(GetThreadSettings).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId })

	const givenGroup = async () =>
		givenRemote(testBed, { channelId: GROUP_CHANNEL, remoteId: GROUP_ID, type: ContactKind.GROUP, name: 'DEMO SHOP BOT' })

	it('a member the live membership projection knows about, absent from the JSON roster, APPEARS', async () => {
		await givenGroup()
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
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
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
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
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			channelId: GROUP_CHANNEL,
			contactExternalId: JID,
			contactKind: ContactKind.USER,
		})

		const { participants } = await settingsFor(thread.id.value)

		expect(participants.map(p => p.participantId).sort()).toEqual(['operator', JID].sort())
	})
})

/**
 * The two halves of the language field, and why the read ships BOTH.
 *
 * `declared` is what the operator chose for THIS conversation — absent when they never did, which is
 * what the dialog's "account default" option is bound to. `effective` is what is actually in force,
 * which is the only thing that answers "so what will it speak?". Collapsing them into one value would
 * make the dialog unable to tell "chose Portuguese" from "inherits Portuguese" — and those two diverge
 * the moment the account language changes.
 */
describe("GetThreadSettings — the conversation's language, declared and effective", () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		// The mock identity carries no language by default — restored per test so a case that sets one
		// cannot leak into the next.
		withAccountLanguage(undefined)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/** Points the mock cloud session at an account that HAS (or has not) chosen a language. */
	const withAccountLanguage = (language: Language | undefined) =>
		(testBed.resolve(CloudSession) as MockCloudSession).setIdentity({
			user: { id: MOCK_CLOUD_USER_ID, email: 'operator@example.test', name: 'Test Operator', emailVerified: true, language },
			session: {
				id: MOCK_CLOUD_SESSION_ID,
				userId: MOCK_CLOUD_USER_ID,
				expiresAt: new Date('2999-12-31T00:00:00.000Z'),
				ownerId: MOCK_CLOUD_OWNER_ID,
			},
		})

	const languageOf = async (threadId: string) =>
		(await testBed.resolve(GetThreadSettings).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId })).language

	it('nothing declared and no account choice → declared absent, effective is the product default', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		expect(await languageOf(thread.id.value)).toEqual({ declared: undefined, effective: Language.PT_BR })
	})

	it('nothing declared, account in English → the conversation INHERITS it, and declared stays absent', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		withAccountLanguage(Language.EN_US)

		expect(await languageOf(thread.id.value)).toEqual({ declared: undefined, effective: Language.EN_US })
	})

	it('declared English over a Portuguese account → the conversation wins', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		withAccountLanguage(Language.PT_BR)
		await testBed.resolve(ConfigureLanguage).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, language: Language.EN_US })

		expect(await languageOf(thread.id.value)).toEqual({ declared: Language.EN_US, effective: Language.EN_US })
	})

	/**
	 * THE CASE THE TWO FIELDS EXIST FOR. Declaring pt-BR and merely inheriting it report the same
	 * `effective` and a DIFFERENT `declared` — and only the declared one survives the account changing.
	 */
	it('declaring pt-BR is not the same state as inheriting it', async () => {
		const declaredThread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const inheritingThread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, contactExternalId: '5511900000099@s.whatsapp.net' })
		await testBed
			.resolve(ConfigureLanguage)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: declaredThread.id.value, language: Language.PT_BR })

		withAccountLanguage(Language.PT_BR)
		expect((await languageOf(declaredThread.id.value)).effective).toBe(Language.PT_BR)
		expect((await languageOf(inheritingThread.id.value)).effective).toBe(Language.PT_BR)

		// The account moves. Only the thread that never chose follows it.
		withAccountLanguage(Language.EN_US)
		expect(await languageOf(declaredThread.id.value)).toEqual({ declared: Language.PT_BR, effective: Language.PT_BR })
		expect(await languageOf(inheritingThread.id.value)).toEqual({ declared: undefined, effective: Language.EN_US })
	})

	it('an account language the product does not ship collapses to the default, and does not fail the dialog', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		withAccountLanguage('fr-CH' as Language)

		expect(await languageOf(thread.id.value)).toEqual({ declared: undefined, effective: Language.PT_BR })
	})
})
