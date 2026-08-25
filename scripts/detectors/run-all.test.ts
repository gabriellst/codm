import { describe, expect, it } from 'bun:test'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DETECTORS } from './run-all'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * The whole point of run-all.ts is that `bun run detect` covers every detector. That guarantee is
 * only as good as its registry: a detector added to this directory but never added to DETECTORS
 * would never run, and the aggregate "all N detectors clean" line would still read as full
 * coverage — the exact failure mode run-all.ts exists to kill, one level up.
 */
describe('run-all registry', () => {
	const onDisk = readdirSync(HERE)
		.filter(f => f.endsWith('.ts'))
		.filter(f => !f.endsWith('.test.ts'))
		.filter(f => f !== 'run-all.ts')
		.map(f => f.replace(/\.ts$/, ''))
		.sort()

	it('registers every detector present on disk', () => {
		expect([...DETECTORS.map(([name]) => name)].sort()).toEqual(onDisk)
	})

	it('is not vacuous — the directory actually holds detectors', () => {
		// Piso de NÃO-VACUIDADE, não ratchet: existe para que um glob que devolva vazio não faça o
		// teste acima passar comparando duas listas vazias. O número é por repo — o template usa 8
		// (tem 9 em disco: route-closure e workspace-deps a mais, que o codm não tem). Aqui são 7.
		expect(onDisk.length).toBeGreaterThanOrEqual(7)
	})

	it('points every registered name at a file that exists', async () => {
		for (const [name] of DETECTORS) {
			expect(await Bun.file(join(HERE, `${name}.ts`)).exists()).toBe(true)
		}
	})
})
