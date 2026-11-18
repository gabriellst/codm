import { describe, expect, it } from 'bun:test'
import type { HttpControllerRequest } from '@codm/core-typescript'
import { PanelDeviceMiddleware } from '../middlewares'
import { newPanelCode, panelCodeHash, panelCodeMatches, panelDeviceCookie } from './panelIdentity'

/** The device cookie and the code hash (fase 2, item 6a) — the two pieces a browser and a leaked table see. */
describe('panel identity primitives', () => {
	it('the device cookie is HttpOnly, Secure, SameSite=Strict, scoped to ONE panel path, 30 days; forgetting clears it', () => {
		const set = panelDeviceCookie('groupToken123', 'device-token')
		expect(set).toBe('codm_panel=device-token; Path=/panel/g/groupToken123; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict')
		expect(panelDeviceCookie('groupToken123')).toContain('Max-Age=0')
	})

	it('a code hash is bound to its request and compared in constant time', () => {
		const code = newPanelCode()
		expect(code).toMatch(/^\d{6}$/)
		const hash = panelCodeHash('req-1', code)
		expect(hash).not.toContain(code)
		expect(panelCodeMatches('req-1', code, hash)).toBe(true)
		expect(panelCodeMatches('req-2', code, hash)).toBe(false)
		expect(panelCodeMatches('req-1', code === '000000' ? '000001' : '000000', hash)).toBe(false)
	})

	it('the middleware lifts only the panel cookie into ctx, and nothing when absent', async () => {
		const request = (cookie?: string): HttpControllerRequest<unknown> => {
			const url = 'https://cloud.test/panel/g/x/me'
			return { url, ctx: {}, raw: new Request(url, { headers: cookie ? { cookie } : {} }) }
		}
		const withCookie = request('other=1; codm_panel=abc_DEF-1; more=2')
		await new PanelDeviceMiddleware().execute(withCookie)
		expect(withCookie.ctx).toEqual({ panelDevice: 'abc_DEF-1' })
		const without = request()
		await new PanelDeviceMiddleware().execute(without)
		expect(without.ctx).toEqual({})
	})
})
