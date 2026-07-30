// GetAttachThreadWizard — the only BFF read with a real keyset cursor, and the query that carried
// the heaviest pg-isms.
//
// The search case is the one that MATTERS most: the previous implementation used the
// case-insensitive LIKE helper, which drizzle declares dialect-neutral, so it compiled clean and
// only failed when the database rejected the operator at runtime. Nothing but EXECUTING the search
// path catches that — which is why the case below deliberately searches with a different case than
// the stored name.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { DrizzleDatabaseDriver } from '@codm/core-typescript'
import { channels, remotes } from '@codm/contracts/db'
import { ChannelKind, ChannelStatus, ContactKind } from '@codm/contracts-typescript/wire/enums'
import { GetAttachThreadWizard } from './GetAttachThreadWizard'

const OWNER = '11111111-1111-4111-8111-111111111111'
const CHANNEL_A = '22222222-2222-4222-8222-222222222222'
const CHANNEL_B = '33333333-3333-4333-8333-333333333333'

describe('GetAttachThreadWizard', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let driver: DrizzleDatabaseDriver
	let wizard: GetAttachThreadWizard

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		driver = testBed.resolve(DrizzleDatabaseDriver)
		wizard = testBed.resolve(GetAttachThreadWizard)
	})

	beforeEach(async () => {
		await testBed.reset()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	const givenChannel = async (channelId: string) => {
		await driver.transaction(tx =>
			tx.insert(channels).values({
				id: channelId,
				ownerId: OWNER,
				platform: ChannelKind.WHATSAPP,
				name: 'WhatsApp',
				status: ChannelStatus.CONNECTED,
				ownerRemoteId: `acct-${channelId}`,
				credentials: {},
			}),
		)
	}

	const givenRemote = async (channelId: string, remoteId: string, name: string, lastMessageAt: Date | null) => {
		const now = new Date()
		await driver.transaction(tx =>
			tx.insert(remotes).values({
				channelId,
				remoteId,
				type: ContactKind.USER,
				platform: ChannelKind.WHATSAPP,
				name,
				lastMessageAt,
				// `gateway_remotes` is a Go-owned PROJECTION: created_at/updated_at are projector-set and
				// have no db-side default on either dialect, so the writer supplies them.
				createdAt: now,
				updatedAt: now,
			}),
		)
	}

	it('pages by keyset with no overlap and no hole, most-recent first', async () => {
		await givenChannel(CHANNEL_A)
		// 35 contacts > CONTACTS_PAGE_SIZE (30), each one minute apart.
		const base = Date.UTC(2026, 0, 1, 12, 0, 0)
		for (let i = 0; i < 35; i += 1) {
			await givenRemote(CHANNEL_A, `r-${String(i).padStart(3, '0')}`, `Contact ${i}`, new Date(base + i * 60_000))
		}

		const page1 = await wizard.execute({ ownerId: OWNER })
		expect(page1.contacts).toHaveLength(30)
		expect(page1.contactsNextCursor).toBeTruthy()
		// Most recent first.
		expect(page1.contacts[0]?.externalId).toBe('r-034')

		const page2 = await wizard.execute({ ownerId: OWNER, cursor: page1.contactsNextCursor as string })
		expect(page2.contacts).toHaveLength(5)
		expect(page2.contactsNextCursor).toBeNull()

		const seen = [...page1.contacts, ...page2.contacts].map(c => c.externalId)
		expect(new Set(seen).size).toBe(35) // no overlap
		expect(seen).toContain('r-000') // no hole
	})

	it('breaks a sortKey tie by (channelId, remoteId) and pages across the tie', async () => {
		await givenChannel(CHANNEL_A)
		await givenChannel(CHANNEL_B)
		const tie = new Date(Date.UTC(2026, 0, 1, 12, 0, 0))
		// 31 rows, ALL with the same lastMessageAt, so only the tie-break decides the order.
		for (let i = 0; i < 16; i += 1) await givenRemote(CHANNEL_A, `t-${String(i).padStart(3, '0')}`, `A ${i}`, tie)
		for (let i = 0; i < 15; i += 1) await givenRemote(CHANNEL_B, `t-${String(i).padStart(3, '0')}`, `B ${i}`, tie)

		const page1 = await wizard.execute({ ownerId: OWNER })
		const page2 = await wizard.execute({ ownerId: OWNER, cursor: page1.contactsNextCursor as string })
		const seen = [...page1.contacts, ...page2.contacts].map(c => `${c.channelId}:${c.externalId}`)

		expect(seen).toHaveLength(31)
		expect(new Set(seen).size).toBe(31)
		// Ascending within the tie, channel first then remote — the declared tuple.
		expect([...seen]).toEqual([...seen].sort())
	})

	it('orders a null lastMessageAt LAST (the epoch sentinel is 0 in this dialect)', async () => {
		await givenChannel(CHANNEL_A)
		await givenRemote(CHANNEL_A, 'r-null', 'Never messaged', null)
		await givenRemote(CHANNEL_A, 'r-old', 'Old', new Date(Date.UTC(2020, 0, 1)))
		await givenRemote(CHANNEL_A, 'r-new', 'New', new Date(Date.UTC(2026, 0, 1)))

		const out = await wizard.execute({ ownerId: OWNER })
		expect(out.contacts.map(c => c.externalId)).toEqual(['r-new', 'r-old', 'r-null'])
		expect(out.contacts.at(-1)?.lastMessageAt).toBeNull()
	})

	it('SEARCHES case-insensitively and actually returns the row', async () => {
		await givenChannel(CHANNEL_A)
		await givenRemote(CHANNEL_A, 'r-ada', 'Ada Lovelace', new Date(Date.UTC(2026, 0, 1)))
		await givenRemote(CHANNEL_A, 'r-alan', 'Alan Turing', new Date(Date.UTC(2026, 0, 2)))

		// Different case than what is stored, and a substring — the exact shape the old operator broke on.
		const out = await wizard.execute({ ownerId: OWNER, search: 'LOVELACE' })
		expect(out.contacts.map(c => c.externalId)).toEqual(['r-ada'])

		const none = await wizard.execute({ ownerId: OWNER, search: 'nobody-here' })
		expect(none.contacts).toHaveLength(0)
	})

	it('rejects a malformed cursor with a typed VALIDATION_ERROR instead of crashing or silently paging from the top', async () => {
		await givenChannel(CHANNEL_A)
		await givenRemote(CHANNEL_A, 'r-1', 'One', new Date(Date.UTC(2026, 0, 1)))

		await expect(wizard.execute({ ownerId: OWNER, cursor: 'not-base64url-json' })).rejects.toMatchObject({
			name: 'VALIDATION_ERROR',
		})

		// A cursor minted by the PREVIOUS build: structurally valid JSON, but `sk` is an ISO string.
		const legacy = Buffer.from(JSON.stringify({ sk: '2026-01-01T12:00:00.000Z', channelId: CHANNEL_A, remoteId: 'r-1' }), 'utf8').toString(
			'base64url',
		)
		await expect(wizard.execute({ ownerId: OWNER, cursor: legacy })).rejects.toMatchObject({ name: 'VALIDATION_ERROR' })
	})
})
