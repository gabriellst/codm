import { describe, expect, it } from 'bun:test'
import type { HttpControllerRequest } from '@codm/core-typescript'
import { MockPanelWebBundle, MOCK_PANEL_ASSET, PanelWebBundle } from '../services/PanelWebBundle'
import { PANEL_CSP, PanelPageController } from './PanelPage'
import { PanelAssetController } from './PanelAsset'

/**
 * THE PANEL PAGE (spec 2026-11-24 §6) — the React app's shell and its files, served by the cloud on the same
 * origin and path the group links already use.
 *
 * What must hold: the shell keeps every header the old page had (no referrer, no framing, no store, no index)
 * and adds a CSP that only lets this origin's files run; a file is served only by its exact built name — any
 * other value, a traversal attempt included, is a 404; and with no bundle built the page says what to run
 * instead of serving an empty document.
 */
const request = <P>(params: P) => ({ params, headers: {}, ctx: {} }) as unknown as HttpControllerRequest<unknown>

/** A bundle that was never built — the dev profile before `build:panel`. */
class NoBundle extends PanelWebBundle {
	shell(): undefined {
		return undefined
	}
	asset(): undefined {
		return undefined
	}
}

const page = (bundle: PanelWebBundle) => async () =>
	(await new PanelPageController(bundle).execute(request({ token: 'kq3pE1aV0m9xT2yR8wB5nC7dF4gH6jL1sZ0uQ3iO9eA' }))) as unknown as Response
const asset = async (file: string) =>
	(await new PanelAssetController(new MockPanelWebBundle()).execute(request({ file }))) as unknown as Response

describe('panel page — the shell', () => {
	it('serves the shell with the old headers and a same-origin CSP', async () => {
		const res = await page(new MockPanelWebBundle())()
		expect(res.status).toBe(200)
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
		expect(res.headers.get('referrer-policy')).toBe('no-referrer')
		expect(res.headers.get('x-frame-options')).toBe('DENY')
		expect(res.headers.get('cache-control')).toBe('no-store')
		expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
		expect(res.headers.get('content-security-policy')).toBe(PANEL_CSP)
		expect(await res.text()).toContain(`/panel/assets/${MOCK_PANEL_ASSET}`)
	})

	it('lets only this origin run code — no inline script, no other host', () => {
		expect(PANEL_CSP).toContain("script-src 'self'")
		expect(PANEL_CSP).not.toMatch(/script-src[^;]*unsafe-inline/)
		expect(PANEL_CSP).toContain("frame-ancestors 'none'")
		expect(PANEL_CSP).toContain("connect-src 'self'")
	})

	it('without a built bundle answers 503 with what to run — never an empty page', async () => {
		const res = await page(new NoBundle())()
		expect(res.status).toBe(503)
		expect(await res.text()).toContain('build:panel')
	})
})

describe('panel page — the files', () => {
	it('serves a built file by its exact name, cached for good', async () => {
		const res = await asset(MOCK_PANEL_ASSET)
		expect(res.status).toBe(200)
		expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
		expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
		expect(res.headers.get('x-content-type-options')).toBe('nosniff')
	})

	it.each(['..', 'index.html', 'panel-mock.JS', '.env', 'panel-mock.js.map'])(
		'answers 404 for a name the build did not write (%s)',
		async file => {
			const res = await asset(file)
			expect(res.status).toBe(404)
		},
	)

	it('refuses a name with a separator before any lookup', () => {
		const params = new PanelAssetController(new MockPanelWebBundle()).inputSchema.shape.params
		for (const file of ['../.env', 'a/b.js', '%2e%2e%2fx', '..\\x']) expect(params.safeParse({ file }).success).toBe(false)
	})
})
