import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenChannel, givenRemote } from '@test/support'
import { ChannelStatus } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { GetOperatorIdentity } from './GetOperatorIdentity'

/**
 * THE APP WEARS THE CHANNEL'S FACE — and gives it back when the channel goes.
 *
 * The header rendered `session.user`, a CONSTANT (`"Operator"`, no picture), so the avatar slot was
 * empty by construction — no amount of front-end work could fill it, because no field existed to
 * fill. The identity now comes from the paired account: `gateway_channels.owner_remote_id` is that
 * account's own JID, and the contact book already holds its name and photo.
 *
 * Every test below states one term of that LOAN, because the loan is the risky part of the decision
 * (see the use case's docblock): it is only as durable as the channel, and it has to degrade to the
 * old behaviour — never to an error, never to a blank name — the moment the channel is not there.
 */
describe('GetOperatorIdentity — the identity borrowed from the connected channel', () => {
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

	const read = () => testBed.resolve(GetOperatorIdentity).execute({ ownerId: OPERATOR_ID })

	/**
	 * The whole point: the JID stored on the channel is looked up in the SAME contact book every other
	 * face on the console comes from, and the console is handed the SAME two halves
	 * (`channelId`, `externalId`) that address `GET /ui/avatars/:channelId/:remoteId`.
	 *
	 * FALSIFIER: resolve the name from `gateway_channels.name` (which is "WhatsApp") instead of the
	 * contact book and this goes red on `displayName` alone.
	 */
	it('resolves the operator name and face from the connected account own contact-book row', async () => {
		const ownJid = '558386387518@s.whatsapp.net'
		const { channelId } = await givenChannel(testBed, { ownerId: OPERATOR_ID, ownerRemoteId: ownJid })
		await givenRemote(testBed, { channelId, remoteId: ownJid, name: 'Gabriel Araújo', avatarUrl: 'https://pps.whatsapp.net/own.jpg' })

		const { identity } = await read()

		expect(identity).toEqual({ channelId, externalId: ownJid, displayName: 'Gabriel Araújo', hasAvatar: true })
	})

	/** The account is known and named, but never had a photo — a name with initials beneath it, not an absence. */
	it('reports the name with no photo when the account row carries no avatar', async () => {
		const ownJid = '5511000000000@s.whatsapp.net'
		const { channelId } = await givenChannel(testBed, { ownerId: OPERATOR_ID, ownerRemoteId: ownJid })
		await givenRemote(testBed, { channelId, remoteId: ownJid, name: 'Sem Foto' })

		const { identity } = await read()

		expect(identity).toEqual({ channelId, externalId: ownJid, displayName: 'Sem Foto', hasAvatar: false })
	})

	/**
	 * TERM 1 OF THE LOAN, and the one the founder asked to see proven: disconnect the channel and the
	 * operator loses the borrowed identity — quietly, back to whatever the console already had.
	 */
	it('lends nothing while the channel is DISCONNECTED', async () => {
		const ownJid = '5511000000001@s.whatsapp.net'
		const { channelId } = await givenChannel(testBed, {
			ownerId: OPERATOR_ID,
			ownerRemoteId: ownJid,
			status: ChannelStatus.DISCONNECTED,
		})
		await givenRemote(testBed, { channelId, remoteId: ownJid, name: 'Desconectado', avatarUrl: 'https://pps.whatsapp.net/own.jpg' })

		await expect(read()).resolves.toEqual({})
	})

	/**
	 * TERM 1, SECOND HALF: `owner_remote_id` is `NOT NULL DEFAULT ''`, so a channel row exists (and can
	 * even read CONNECTED) before the pairing has written the account's JID. The empty string is not an
	 * id — a read that let it through would look up `remote_id = ''` and answer with whatever unnamed
	 * row the sync happened to write.
	 */
	it("lends nothing while owner_remote_id is still the column's empty default", async () => {
		const { channelId } = await givenChannel(testBed, { ownerId: OPERATOR_ID, ownerRemoteId: '' })
		// A contact-book row keyed by the empty string — the row a `''` lookup would wrongly return.
		await givenRemote(testBed, { channelId, remoteId: '', name: 'Não Sou O Dono', avatarUrl: 'https://pps.whatsapp.net/nope.jpg' })

		await expect(read()).resolves.toEqual({})
	})

	/** Paired, connected, but the sync has not written the account's own row yet — nothing to borrow. */
	it('lends nothing when the account JID is absent from the contact book', async () => {
		await givenChannel(testBed, { ownerId: OPERATOR_ID, ownerRemoteId: '5511000000002@s.whatsapp.net' })

		await expect(read()).resolves.toEqual({})
	})

	/** Nothing paired at all — the state of a freshly installed app. Absence, never an error. */
	it('lends nothing when the owner has no channel at all', async () => {
		await expect(read()).resolves.toEqual({})
	})

	/**
	 * THE OWNER GATE. `gateway_channels.owner_id` is the only thing that makes a channel "the
	 * operator's"; another owner's paired account must not put its face in this console's header.
	 */
	it('never borrows from another owner channel', async () => {
		const ownJid = '5511000000003@s.whatsapp.net'
		const { channelId } = await givenChannel(testBed, { ownerId: '00000000-0000-4000-8000-0000000000ff', ownerRemoteId: ownJid })
		await givenRemote(testBed, { channelId, remoteId: ownJid, name: 'Outro Dono', avatarUrl: 'https://pps.whatsapp.net/other.jpg' })

		await expect(read()).resolves.toEqual({})
	})

	/**
	 * THE REVIEW TRIGGER, asserted rather than only commented: with TWO connected accounts "the owner"
	 * has no single answer, and this read picks the most recently updated one. The assertion here is
	 * deliberately weak — it pins that ONE of the two is chosen, not which — because pinning the winner
	 * would turn an acknowledged ambiguity into a contract. When multi-channel ships, this test is the
	 * one that has to be rewritten, and the use case's docblock says what to rewrite it into.
	 */
	it('picks one of several connected accounts — the ambiguity multi-channel has to resolve', async () => {
		// `givenChannel` stamps both rows in the same tick, so the ordering column has to be made to
		// differ explicitly — otherwise this seeds nothing about the tie-break it is describing.
		const first = await givenChannel(testBed, {
			ownerId: OPERATOR_ID,
			ownerRemoteId: '5511000000004@s.whatsapp.net',
			updatedAt: new Date(Date.now() - 60_000),
		})
		await givenRemote(testBed, { channelId: first.channelId, remoteId: '5511000000004@s.whatsapp.net', name: 'Conta Antiga' })
		const second = await givenChannel(testBed, { ownerId: OPERATOR_ID, ownerRemoteId: '5511000000005@s.whatsapp.net' })
		await givenRemote(testBed, { channelId: second.channelId, remoteId: '5511000000005@s.whatsapp.net', name: 'Conta Nova' })

		const { identity } = await read()

		expect(['Conta Antiga', 'Conta Nova']).toContain(identity?.displayName)
	})
})
