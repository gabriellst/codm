import { describe, expect, it } from 'bun:test'
import { BaseError } from '../types/BaseError'
import { SerializedRequest } from './SerializedRequest'

describe('SerializedRequest', () => {
	describe('fromRequest', () => {
		it('captures method, url, headers, and body', async () => {
			const request = new Request('https://api.example.com/billing/webhooks/example-platform?signature=abc', {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-platform': 'example-platform' },
				body: '{"order_id":"order_001"}',
			})

			const serialized = await SerializedRequest.fromRequest(request)

			expect(serialized.method).toBe('POST')
			expect(serialized.url).toBe('https://api.example.com/billing/webhooks/example-platform?signature=abc')
			expect(serialized.headers['content-type']).toBe('application/json')
			expect(serialized.headers['x-platform']).toBe('example-platform')
			expect(serialized.body).toBe('{"order_id":"order_001"}')
		})

		it('leaves the source request body unconsumed (clones before reading)', async () => {
			const request = new Request('https://api.example.com/hook', { method: 'POST', body: 'payload' })

			await SerializedRequest.fromRequest(request)

			// If fromRequest had read the original stream, this would throw.
			expect(await request.text()).toBe('payload')
		})
	})

	describe('deserialize', () => {
		it('round-trips method, url, headers, and body into a live Request', async () => {
			const original = new Request('https://api.example.com/hook?sig=xyz', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{"a":1}',
			})

			const rebuilt = (await SerializedRequest.fromRequest(original)).deserialize()

			expect(rebuilt.method).toBe('POST')
			expect(rebuilt.url).toBe('https://api.example.com/hook?sig=xyz')
			expect(rebuilt.headers.get('content-type')).toBe('application/json')
			expect(await rebuilt.text()).toBe('{"a":1}')
		})

		it('survives a JSON persistence round-trip (the outbox boundary)', async () => {
			const original = new Request('https://api.example.com/hook', {
				method: 'POST',
				headers: { 'x-sig': 'deadbeef' },
				body: '{"event":"order_approved"}',
			})

			const serialized = await SerializedRequest.fromRequest(original)
			// Mirror LibSqlDomainEventRepository.toPersistence: payload is stored
			// as plain JSON, then rehydrated into the VO.
			const persisted = JSON.parse(JSON.stringify(serialized.toJSON()))
			const rebuilt = new SerializedRequest(persisted).deserialize()

			expect(rebuilt.headers.get('x-sig')).toBe('deadbeef')
			expect(await rebuilt.text()).toBe('{"event":"order_approved"}')
		})

		it('omits the body for GET (new Request rejects a body on GET)', () => {
			const vo = new SerializedRequest({ method: 'GET', url: 'https://api.example.com/ping', headers: {}, body: '' })
			expect(() => vo.deserialize()).not.toThrow()
		})
	})

	describe('validation', () => {
		it('throws INVALID_REQUEST for a non-URL url', () => {
			let caught: unknown = null
			try {
				new SerializedRequest({ method: 'POST', url: 'not a url', headers: {}, body: '' })
			} catch (e) {
				caught = e
			}
			expect(caught).toBeInstanceOf(BaseError)
			expect((caught as BaseError).name).toBe('INVALID_REQUEST')
		})

		it('throws INVALID_REQUEST for an empty method', () => {
			let caught: unknown = null
			try {
				new SerializedRequest({ method: '', url: 'https://api.example.com/hook', headers: {}, body: '' })
			} catch (e) {
				caught = e
			}
			expect(caught).toBeInstanceOf(BaseError)
			expect((caught as BaseError).name).toBe('INVALID_REQUEST')
		})
	})
})
