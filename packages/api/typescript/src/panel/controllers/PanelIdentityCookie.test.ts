import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import type { HttpControllerRequest } from '@codm/core-typescript'
import { TestBed } from '@test/support'
import { SyncPanel } from '../usecases/SyncPanel'
import { SyncPanelRoster } from '../usecases/SyncPanelRoster'
import { RequestPanelCode } from '../usecases/RequestPanelCode'
import { VerifyPanelCodeController } from './VerifyPanelCode'
import { GetPanelIdentityController } from './GetPanelIdentity'
import { ForgetPanelDeviceController } from './ForgetPanelDevice'

const OWNER = '019e4d24-6524-7041-9e1c-8108180cde10'
const GROUP = '019e4d24-6524-7041-9e1c-8108180cde20'
const ANA = { memberId: 'm-ana-aaaaaaaaaaaaaaaaaa', name: 'Ana', canRelease: true }

/**
 * THE DEVICE COOKIE end to end through the HTTP controllers (fase 2, item 6a): verify answers with the
 * cookie (HttpOnly, Secure, SameSite=Strict, this panel's path, 30 days) and never the token in the
 * body; that cookie on a later request is who `/me` says; `/forget` clears it.
 */
describe('panel — the device cookie through the controllers', () => {
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

	const request = (
		token: string,
		path: string,
		init: { cookie?: string; body?: Record<string, unknown> } = {},
	): HttpControllerRequest<unknown> => {
		const url = `https://cloud.test/panel/g/${token}/${path}`
		const raw = new Request(url, { method: init.body ? 'POST' : 'GET', headers: init.cookie ? { cookie: init.cookie } : {} })
		return { url, ctx: {}, params: { token }, ...(init.body ? { body: init.body } : {}), raw }
	}

	it('verify sets the scoped cookie, /me reads it back, /forget clears it', async () => {
		const { groups } = await testBed
			.resolve(SyncPanel)
			.execute({ ownerId: OWNER, groups: [{ threadId: GROUP, name: 'Equipe' }], issues: [] })
		const token = groups[0]?.token ?? ''
		await testBed.resolve(SyncPanelRoster).execute({ ownerId: OWNER, groups: [{ threadId: GROUP, members: [ANA] }] })
		await testBed.resolve(RequestPanelCode).execute({ token, memberId: ANA.memberId })
		const code = (await testBed.resolve(SyncPanelRoster).execute({ ownerId: OWNER, groups: [] })).deliveries[0]?.code ?? ''

		const verified = await testBed
			.resolve(VerifyPanelCodeController)
			.executeController(request(token, 'verify', { body: { memberId: ANA.memberId, code } }))
		expect(verified.status).toBe(200)
		expect(await verified.json()).toEqual({ member: ANA })
		const setCookie = verified.headers.get('set-cookie') ?? ''
		expect(setCookie).toMatch(
			new RegExp(`^codm_panel=[A-Za-z0-9_-]{40,}; Path=/panel/g/${token}; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict$`),
		)
		const cookie = setCookie.split(';')[0] ?? ''

		const me = await testBed.resolve(GetPanelIdentityController).executeController(request(token, 'me', { cookie: `other=1; ${cookie}` }))
		expect(await me.json()).toEqual({ member: ANA })
		const nobody = await testBed.resolve(GetPanelIdentityController).executeController(request(token, 'me'))
		expect(await nobody.json()).toEqual({})

		const forgot = await testBed.resolve(ForgetPanelDeviceController).executeController(request(token, 'forget', { cookie, body: {} }))
		expect(forgot.status).toBe(204)
		expect(forgot.headers.get('set-cookie')).toContain('Max-Age=0')
		const after = await testBed.resolve(GetPanelIdentityController).executeController(request(token, 'me', { cookie }))
		expect(await after.json()).toEqual({})
	})
})
