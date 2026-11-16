import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { PgDatabaseDriver } from '@codm/core-typescript'
import { panelCodeRequests } from '@codm/contracts/db/pg'
import { TestBed } from '@test/support'
import { SyncPanel } from './SyncPanel'
import { SyncPanelRoster } from './SyncPanelRoster'
import { ListPanelMembers } from './ListPanelMembers'
import { RequestPanelCode } from './RequestPanelCode'
import { VerifyPanelCode } from './VerifyPanelCode'
import { GetPanelIdentity } from './GetPanelIdentity'
import { ForgetPanelDevice } from './ForgetPanelDevice'
import { RotatePanelLink } from './RotatePanelLink'

const OWNER = '019e4d24-6524-7041-9e1c-8108180cde10'
const OTHER_OWNER = '019e4d24-6524-7041-9e1c-8108180cde11'
const GROUP = '019e4d24-6524-7041-9e1c-8108180cde20'
const OTHER_GROUP = '019e4d24-6524-7041-9e1c-8108180cde21'

const ANA = { memberId: 'm-ana-aaaaaaaaaaaaaaaaaa', name: 'Ana', canRelease: true }
const BETO = { memberId: 'm-beto-bbbbbbbbbbbbbbbbb', name: 'Beto', canRelease: false }

const refused = (promise: Promise<unknown>) =>
	promise.then(
		() => undefined,
		(error: unknown) => (error as { name?: string }).name,
	)

/**
 * WHO IS THIS DEVICE (fase 2, item 6a) against a real Postgres (PGlite).
 *
 * What must hold: the roster the daemon pushes is what the panel lists (names only, and only into the
 * caller's own groups); a code request reaches the daemon ONCE, with the code minted at that moment and
 * only its hash kept; the right code opens a device session, a wrong one spends a try, an expired/used/
 * exhausted one is refused; requests are rate-limited per member; rotating the link kills sessions; a
 * token of another group sees and verifies nothing of this one.
 */
describe('panel — identifying a person by a WhatsApp code', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER, db: 'pg' })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/** Create the group's link (board sync) and push its roster; returns the link token. */
	const groupWithRoster = async (threadId = GROUP, members = [ANA, BETO], ownerId = OWNER) => {
		const { groups } = await testBed.resolve(SyncPanel).execute({ ownerId, groups: [{ threadId, name: 'Equipe' }], issues: [] })
		await testBed.resolve(SyncPanelRoster).execute({ ownerId, groups: [{ threadId, members }] })
		return groups[0]?.token ?? ''
	}
	const pull = (ownerId = OWNER) => testBed.resolve(SyncPanelRoster).execute({ ownerId, groups: [] })
	/** Ask for a code and let the daemon pull it; returns the plain code the DM would carry. */
	const codeFor = async (token: string, memberId: string) => {
		await testBed.resolve(RequestPanelCode).execute({ token, memberId })
		const { deliveries } = await pull()
		return deliveries.find(delivery => delivery.memberId === memberId)?.code ?? ''
	}
	const rows = () => testBed.resolve(PgDatabaseDriver).db.select().from(panelCodeRequests)
	const age = async (patch: Partial<typeof panelCodeRequests.$inferInsert>) => {
		const db = testBed.resolve(PgDatabaseDriver).db
		for (const row of await rows()) await db.update(panelCodeRequests).set(patch).where(eq(panelCodeRequests.id, row.id))
	}

	it('lists the roster the daemon pushed — names only — and never into a group of another owner', async () => {
		const token = await groupWithRoster()
		expect((await testBed.resolve(ListPanelMembers).execute({ token })).members).toEqual([
			{ memberId: ANA.memberId, name: 'Ana' },
			{ memberId: BETO.memberId, name: 'Beto' },
		])

		await testBed.resolve(SyncPanelRoster).execute({ ownerId: OTHER_OWNER, groups: [{ threadId: GROUP, members: [] }] })
		expect((await testBed.resolve(ListPanelMembers).execute({ token })).members).toHaveLength(2)
		expect(await refused(testBed.resolve(ListPanelMembers).execute({ token: 'x'.repeat(43) }))).toBe('PANEL_NOT_FOUND')
	})

	it('a request reaches the daemon once, with a fresh 6-digit code whose plain value is never stored', async () => {
		const token = await groupWithRoster()
		await testBed.resolve(RequestPanelCode).execute({ token, memberId: ANA.memberId })

		const first = await pull()
		expect(first.deliveries).toEqual([
			{ requestId: expect.any(String), threadId: GROUP, memberId: ANA.memberId, code: expect.stringMatching(/^\d{6}$/) },
		])
		expect((await pull()).deliveries).toEqual([])
		// Another owner's pull never sees it.
		expect((await pull(OTHER_OWNER)).deliveries).toEqual([])

		const [row] = await rows()
		expect(row?.codeHash).toBeString()
		expect(JSON.stringify(row)).not.toContain(first.deliveries[0]?.code ?? 'never')
		expect(row?.expiresAt && row.issuedAt && row.expiresAt.getTime() - row.issuedAt.getTime()).toBe(10 * 60 * 1000)
	})

	it('the right code opens a device session that says who it is; forget ends it', async () => {
		const token = await groupWithRoster()
		const code = await codeFor(token, ANA.memberId)

		const verified = await testBed.resolve(VerifyPanelCode).execute({ token, memberId: ANA.memberId, code })
		expect(verified.member).toEqual(ANA)
		expect(verified.deviceToken.length).toBeGreaterThanOrEqual(40)

		expect((await testBed.resolve(GetPanelIdentity).execute({ token, deviceToken: verified.deviceToken })).member).toEqual(ANA)
		expect((await testBed.resolve(GetPanelIdentity).execute({ token })).member).toBeUndefined()

		// Used once — the same code cannot open a second device.
		expect(await refused(testBed.resolve(VerifyPanelCode).execute({ token, memberId: ANA.memberId, code }))).toBe('PANEL_CODE_EXPIRED')

		await testBed.resolve(ForgetPanelDevice).execute({ token, deviceToken: verified.deviceToken })
		expect((await testBed.resolve(GetPanelIdentity).execute({ token, deviceToken: verified.deviceToken })).member).toBeUndefined()
	})

	it('a wrong code spends a try (and the try sticks); five wrong tries lock the code even for the right one', async () => {
		const token = await groupWithRoster()
		const code = await codeFor(token, ANA.memberId)
		const wrong = code === '000000' ? '111111' : '000000'

		expect(await refused(testBed.resolve(VerifyPanelCode).execute({ token, memberId: ANA.memberId, code: wrong }))).toBe(
			'PANEL_CODE_INVALID',
		)
		expect((await rows())[0]?.attempts).toBe(1)
		for (let i = 0; i < 4; i++) await refused(testBed.resolve(VerifyPanelCode).execute({ token, memberId: ANA.memberId, code: wrong }))
		expect(await refused(testBed.resolve(VerifyPanelCode).execute({ token, memberId: ANA.memberId, code }))).toBe(
			'PANEL_CODE_ATTEMPTS_EXCEEDED',
		)
	})

	it('an expired code is refused; no code delivered yet is just invalid', async () => {
		const token = await groupWithRoster()
		expect(await refused(testBed.resolve(VerifyPanelCode).execute({ token, memberId: ANA.memberId, code: '123456' }))).toBe(
			'PANEL_CODE_INVALID',
		)
		const code = await codeFor(token, ANA.memberId)
		await age({ expiresAt: new Date(Date.now() - 1000) })
		expect(await refused(testBed.resolve(VerifyPanelCode).execute({ token, memberId: ANA.memberId, code }))).toBe('PANEL_CODE_EXPIRED')
	})

	it('code requests are limited per member — one a minute, five an hour — and only for members on the roster', async () => {
		const token = await groupWithRoster()
		await testBed.resolve(RequestPanelCode).execute({ token, memberId: ANA.memberId })
		expect(await refused(testBed.resolve(RequestPanelCode).execute({ token, memberId: ANA.memberId }))).toBe('PANEL_CODE_RATE_LIMITED')
		// Beto is a different member: his own budget.
		await testBed.resolve(RequestPanelCode).execute({ token, memberId: BETO.memberId })

		for (let i = 0; i < 4; i++) {
			await age({ requestedAt: new Date(Date.now() - (i + 2) * 61 * 1000) })
			await testBed.resolve(RequestPanelCode).execute({ token, memberId: ANA.memberId })
		}
		await age({ requestedAt: new Date(Date.now() - 2 * 60 * 1000) })
		expect(await refused(testBed.resolve(RequestPanelCode).execute({ token, memberId: ANA.memberId }))).toBe('PANEL_CODE_RATE_LIMITED')

		expect(await refused(testBed.resolve(RequestPanelCode).execute({ token, memberId: 'm-nobody-zzzzzzzzzzzzzz' }))).toBe(
			'PANEL_MEMBER_NOT_FOUND',
		)
	})

	it('a member who left the roster is nobody on a device that was verified as them', async () => {
		const token = await groupWithRoster()
		const verified = await testBed
			.resolve(VerifyPanelCode)
			.execute({ token, memberId: BETO.memberId, code: await codeFor(token, BETO.memberId) })
		await testBed.resolve(SyncPanelRoster).execute({ ownerId: OWNER, groups: [{ threadId: GROUP, members: [ANA] }] })
		expect((await testBed.resolve(GetPanelIdentity).execute({ token, deviceToken: verified.deviceToken })).member).toBeUndefined()
	})

	it('rotating the link kills the sessions and the pending codes of the group', async () => {
		const token = await groupWithRoster()
		const verified = await testBed
			.resolve(VerifyPanelCode)
			.execute({ token, memberId: ANA.memberId, code: await codeFor(token, ANA.memberId) })
		await testBed.resolve(RequestPanelCode).execute({ token, memberId: BETO.memberId })

		const rotated = await testBed.resolve(RotatePanelLink).execute({ ownerId: OWNER, threadId: GROUP })
		expect(
			(await testBed.resolve(GetPanelIdentity).execute({ token: rotated.token, deviceToken: verified.deviceToken })).member,
		).toBeUndefined()
		expect(await refused(testBed.resolve(GetPanelIdentity).execute({ token, deviceToken: verified.deviceToken }))).toBe('PANEL_NOT_FOUND')
		expect((await pull()).deliveries).toEqual([])
	})

	it("another group's token neither sees this device nor verifies this group's code", async () => {
		const token = await groupWithRoster()
		const otherToken = await groupWithRoster(OTHER_GROUP, [ANA])
		const code = await codeFor(token, ANA.memberId)

		// Same memberId string in the other group (the daemon derives ids per group, but the cloud must
		// not rely on that): the code was issued for THIS group only.
		expect(await refused(testBed.resolve(VerifyPanelCode).execute({ token: otherToken, memberId: ANA.memberId, code }))).toBe(
			'PANEL_CODE_INVALID',
		)
		const verified = await testBed.resolve(VerifyPanelCode).execute({ token, memberId: ANA.memberId, code })
		expect(
			(await testBed.resolve(GetPanelIdentity).execute({ token: otherToken, deviceToken: verified.deviceToken })).member,
		).toBeUndefined()
	})
})
