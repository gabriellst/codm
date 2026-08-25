import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { Id, BaseError } from '@codm/core-typescript'
import { TestBed, givenChannel, givenRemote } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ContactAvatarStore, MockContactAvatarStore } from '../services/ContactAvatarStore'
import { GetContactAvatar } from './GetContactAvatar'

/**
 * THE OWNER GATE IS THE WHOLE POINT OF THIS SUITE.
 *
 * `gateway_remotes` — the contact book the Go gateway writes — has NO `owner_id` column. It is a
 * child projection scoped by `channel_id` alone, so nothing about a remote row says whose it is. The
 * only thing that does is the channel it hangs off:
 *
 *     remotes.channel_id → channels.id → channels.owner_id
 *
 * An endpoint that served a photo without walking that path would hand one operator another
 * operator's contacts' faces — addressed by a JID, which is a phone number, which anyone can guess.
 * So the first test below is not a formality: it is the reason the endpoint is allowed to exist.
 *
 * FALSIFIER: drop the `eq(channels.ownerId, input.ownerId)` term from `GetContactAvatar` and the
 * first test goes red while every other test in the file stays green — which is exactly why the
 * happy path alone would not have caught it.
 */
describe('GetContactAvatar — a photo is served only through the channel its owner owns', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const PHOTO_URL = 'https://pps.whatsapp.net/v/t61.24694-24/photo_n.jpg?ccb=11-4&oh=sig&oe=6900'
	const PHOTO = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), contentType: 'image/jpeg' }
	const CONTACT = '5511999999999@s.whatsapp.net'

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

	const store = () => {
		const resolved = testBed.resolve(ContactAvatarStore)
		if (!(resolved instanceof MockContactAvatarStore))
			throw new Error(`integration must bind the double, got ${resolved.constructor.name} — a suite must not reach a CDN`)
		return resolved
	}

	const avatarFor = async (channelId: string, remoteId: string, ownerId: string = MOCK_CLOUD_OWNER_ID) =>
		testBed.resolve(GetContactAvatar).execute({ ownerId, channelId, remoteId })

	/** The CODE, never the message — `BaseError` carries the code as `name` (see core/types/BaseError). */
	const codeOf = async (promise: Promise<unknown>): Promise<string> => {
		try {
			await promise
		} catch (error) {
			return error instanceof BaseError ? error.name : `not a BaseError: ${String(error)}`
		}
		return 'no error thrown'
	}

	/** THE test. Everything about this read exists to make this one come out this way. */
	it('refuses another owner: the row, the url and the cached bytes all exist, and none of it is served', async () => {
		const strangersOwnerId = Id.value()
		const { channelId } = await givenChannel(testBed, { ownerId: strangersOwnerId })
		await givenRemote(testBed, { channelId, remoteId: CONTACT, name: 'Someone Else', avatarUrl: PHOTO_URL })
		store().seed(PHOTO_URL, PHOTO)

		expect(await codeOf(avatarFor(channelId, CONTACT))).toBe('CONTACT_AVATAR_NOT_FOUND')
	})

	it('serves the photo when the channel IS the operator’s — the same fixture, one field different', async () => {
		const { channelId } = await givenChannel(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await givenRemote(testBed, { channelId, remoteId: CONTACT, name: 'Rafa Lima', avatarUrl: PHOTO_URL })
		store().seed(PHOTO_URL, PHOTO)

		const avatar = await avatarFor(channelId, CONTACT)

		expect(avatar.contentType).toBe('image/jpeg')
		expect([...avatar.bytes]).toEqual([...PHOTO.bytes])
	})

	it('answers the same code for a channel that does not exist at all', async () => {
		expect(await codeOf(avatarFor(Id.value(), CONTACT))).toBe('CONTACT_AVATAR_NOT_FOUND')
	})

	it('answers the same code for a contact who is not in that channel’s book', async () => {
		const { channelId } = await givenChannel(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		expect(await codeOf(avatarFor(channelId, CONTACT))).toBe('CONTACT_AVATAR_NOT_FOUND')
	})

	it('answers the same code for a contact who has no photo — 332 of the 845 real rows are this', async () => {
		const { channelId } = await givenChannel(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await givenRemote(testBed, { channelId, remoteId: CONTACT, name: 'Sem Foto' })

		expect(await codeOf(avatarFor(channelId, CONTACT))).toBe('CONTACT_AVATAR_NOT_FOUND')
	})

	/**
	 * A signed CDN url EXPIRES, and the origin then refuses it. That is not an error the console can
	 * act on — it draws initials either way — so it collapses into the same absence as the other four.
	 */
	it('answers the same code when the origin will not hand the bytes over', async () => {
		const { channelId } = await givenChannel(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await givenRemote(testBed, { channelId, remoteId: CONTACT, name: 'Foto Expirada', avatarUrl: 'https://pps.whatsapp.net/expired.jpg' })

		expect(await codeOf(avatarFor(channelId, CONTACT))).toBe('CONTACT_AVATAR_NOT_FOUND')
	})
})
