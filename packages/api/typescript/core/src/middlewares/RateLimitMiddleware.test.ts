import 'reflect-metadata'
import { describe, it, expect } from 'bun:test'
import type { HttpControllerRequest } from '../types/Http'
import { RateLimitStore, type RateLimitResult, InMemoryRateLimitStore } from '../services/RateLimitStore'
import { RateLimitMiddleware } from './RateLimitMiddleware'

// sign-in is configured at max 5 / window in the middleware's action table.
function signInReq(ip: string, email?: string): HttpControllerRequest<unknown> {
	return {
		url: `http://localhost/authentication/sign-in/email`,
		headers: { 'x-forwarded-for': ip },
		body: email ? { email } : {},
		ctx: {},
		raw: new Request('http://localhost/authentication/sign-in/email'),
	} as unknown as HttpControllerRequest<unknown>
}

async function hammer(mw: RateLimitMiddleware, req: HttpControllerRequest<unknown>, times: number) {
	for (let i = 0; i < times; i++) await mw.execute(req)
}

describe('RateLimitMiddleware', () => {
	it('passes a request that does not match any configured action', async () => {
		const mw = new RateLimitMiddleware(new InMemoryRateLimitStore())
		const req = {
			url: 'http://localhost/authentication/get-session',
			headers: {},
			body: {},
			ctx: {},
			raw: new Request('http://localhost/'),
		} as unknown as HttpControllerRequest<unknown>
		await expect(mw.execute(req)).resolves.toMatchObject({})
	})

	it('throws RATE_LIMITED once the IP exceeds the sign-in budget', async () => {
		const mw = new RateLimitMiddleware(new InMemoryRateLimitStore())
		const req = signInReq('1.1.1.1', 'a@example.com')
		await hammer(mw, req, 5)
		await expect(mw.execute(req)).rejects.toMatchObject({ name: 'RATE_LIMITED' })
	})

	it('throws RATE_LIMITED on the email counter even when each IP is under its own limit', async () => {
		const mw = new RateLimitMiddleware(new InMemoryRateLimitStore())
		// 5 distinct IPs, same victim email → IP counters all at 1, email counter at 5.
		for (let i = 0; i < 5; i++) await mw.execute(signInReq(`10.0.0.${i}`, 'victim@example.com'))
		await expect(mw.execute(signInReq('10.0.0.99', 'victim@example.com'))).rejects.toMatchObject({ name: 'RATE_LIMITED' })
	})

	it('evaluates only the IP counter when no email is present', async () => {
		const mw = new RateLimitMiddleware(new InMemoryRateLimitStore())
		const req = signInReq('2.2.2.2')
		await hammer(mw, req, 5)
		// 6th from same IP is blocked (IP counter), proving the path still runs without an email.
		await expect(mw.execute(req)).rejects.toMatchObject({ name: 'RATE_LIMITED' })
	})

	it('scopes counters per sub-action — exhausting sign-in does not block sign-up', async () => {
		const mw = new RateLimitMiddleware(new InMemoryRateLimitStore())
		await hammer(mw, signInReq('3.3.3.3', 'x@example.com'), 5)
		const signUp = {
			url: 'http://localhost/authentication/sign-up/email',
			headers: { 'x-forwarded-for': '3.3.3.3' },
			body: { email: 'x@example.com' },
			ctx: {},
			raw: new Request('http://localhost/'),
		} as unknown as HttpControllerRequest<unknown>
		await expect(mw.execute(signUp)).resolves.toMatchObject({})
	})

	it('fails open (allows) when the store throws', async () => {
		const throwingStore: RateLimitStore = {
			hit: async (): Promise<RateLimitResult> => {
				throw new Error('redis down')
			},
		}
		const mw = new RateLimitMiddleware(throwingStore)
		await expect(mw.execute(signInReq('4.4.4.4', 'a@example.com'))).resolves.toMatchObject({})
	})
})
