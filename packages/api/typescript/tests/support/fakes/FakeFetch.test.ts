import { describe, expect, it } from 'bun:test'
import { createFakeFetch, jsonResponse } from './FakeFetch'

describe('createFakeFetch', () => {
	it('routes by url fragment and captures calls', async () => {
		const { fetch, calls } = createFakeFetch({
			routes: { '/shop.json': () => jsonResponse({ shop: { myshopify_domain: 'foo.myshopify.com' } }) },
		})

		const res = await fetch('https://foo.myshopify.com/admin/api/2024-04/shop.json')
		const body = (await res.json()) as { shop: { myshopify_domain: string } }

		expect(body.shop.myshopify_domain).toBe('foo.myshopify.com')
		expect(calls[0]!.url).toContain('/shop.json')
	})

	it('falls back to default and supports non-2xx', async () => {
		const { fetch } = createFakeFetch({ default: () => jsonResponse({ errors: 'unauthorized' }, { status: 401 }) })
		const res = await fetch('https://x/y')
		expect(res.status).toBe(401)
	})
})
