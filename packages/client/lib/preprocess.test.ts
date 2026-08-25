import { describe, it, expect, beforeAll } from 'bun:test'
import { writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { preprocessSpec } from './preprocess'

const tmp = join(tmpdir(), `preprocess-${Date.now()}`)
beforeAll(async () => {
	await mkdir(tmp, { recursive: true })
})

async function writeSpec(name: string, body: object): Promise<string> {
	const p = join(tmp, name)
	await writeFile(p, JSON.stringify(body))
	return p
}

describe('preprocessSpec', () => {
	it('accepts a minimal compliant spec', async () => {
		const path = await writeSpec('ok.json', {
			openapi: '3.0.3',
			info: { title: 't', version: '1' },
			paths: {
				'/x': { get: { operationId: 'getX', responses: { 200: { description: 'ok' } } } },
			},
			components: { schemas: {} },
		})
		const { spec, skippedSse } = await preprocessSpec(path)
		expect(skippedSse).toBe(0)
		expect((spec.paths as Record<string, unknown>)['/x']).toBeDefined()
	})

	it('rejects 3.1 dialect (R-01)', async () => {
		const path = await writeSpec('bad-01.json', { openapi: '3.1.0', info: { title: 't', version: '1' }, paths: {} })
		await expect(preprocessSpec(path)).rejects.toThrow(/R-01/)
	})

	it('rejects missing operationId (R-02)', async () => {
		const path = await writeSpec('bad-02.json', {
			openapi: '3.0.3',
			info: { title: 't', version: '1' },
			paths: { '/x': { get: { responses: { 200: { description: 'ok' } } } } },
		})
		await expect(preprocessSpec(path)).rejects.toThrow(/R-02/)
	})

	it('rejects type:[X,null] (R-05)', async () => {
		const path = await writeSpec('bad-05.json', {
			openapi: '3.0.3',
			info: { title: 't', version: '1' },
			paths: { '/x': { get: { operationId: 'getX', responses: { 200: { description: 'ok' } } } } },
			components: { schemas: { F: { type: ['string', 'null'] } } },
		})
		await expect(preprocessSpec(path)).rejects.toThrow(/R-05/)
	})

	it('drops SSE operations (R-10)', async () => {
		const path = await writeSpec('sse.json', {
			openapi: '3.0.3',
			info: { title: 't', version: '1' },
			paths: {
				'/events': { get: { operationId: 'getEvents', 'x-tpl-sse': true, responses: { 200: { description: 'sse' } } } },
				'/x': { get: { operationId: 'getX', responses: { 200: { description: 'ok' } } } },
			},
		})
		const { spec, skippedSse } = await preprocessSpec(path)
		expect(skippedSse).toBe(1)
		expect((spec.paths as Record<string, unknown>)['/events']).toBeUndefined()
		expect((spec.paths as Record<string, unknown>)['/x']).toBeDefined()
	})
})
