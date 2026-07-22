import { describe, it, expect } from 'bun:test'
import { join } from 'node:path'
import { discoverApis } from './discover'

describe('discoverApis', () => {
	it('returns { service, specPath } for each api/<service>/public/openapi.json', async () => {
		const repoRoot = join(import.meta.dirname, '../../..')
		const sources = await discoverApis(repoRoot)
		expect(sources.length).toBeGreaterThan(0)
		for (const s of sources) {
			expect(s).toHaveProperty('service')
			expect(s).toHaveProperty('specPath')
			expect(s).not.toHaveProperty('lang')
			expect(typeof s.service).toBe('string')
			expect(typeof s.specPath).toBe('string')
		}
	})
})
