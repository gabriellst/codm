import { describe, expect, it } from 'bun:test'
import { Glob } from 'bun'

/**
 * RAIL (spec Decision 12, padrão de packages/api/typescript/tests/architecture/): todo teste que
 * monta `RouterProvider` NA MÃO precisa de `router.load()` no mesmo arquivo. O mountRouter torna o
 * erro difícil; este rail o torna impossível de passar. Falseado removendo um `load()` — o teste
 * fica vermelho NOMEANDO o arquivo.
 */
describe('rail: RouterProvider exige router.load()', () => {
	it('nenhum teste monta RouterProvider sem load()', () => {
		const glob = new Glob('src/**/*.test.{ts,tsx}')
		const offenders: string[] = []
		for (const file of glob.scanSync({ cwd: `${import.meta.dir}/../..` })) {
			const source = require('node:fs').readFileSync(`${import.meta.dir}/../../${file}`, 'utf8') as string
			if (source.includes('<RouterProvider') && !source.includes('router.load()') && !source.includes('mountRouter(')) {
				offenders.push(file)
			}
		}
		expect(offenders).toEqual([])
	})
})
