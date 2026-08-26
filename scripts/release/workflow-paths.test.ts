import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

// Rail do non-negotiable 5: o job `changes` de correctness.yml REDECLARA o path-set do
// release-beta.yml como regex bash. A redeclaração é inevitável — `on.paths` filtraria o
// `detect` junto (que tem de rodar sempre), e o plano veta action externa numa cota que já
// estourou uma vez — e redeclaração inevitável ganha GATE. Este teste prende as duas listas:
// todo caminho que dispara um beta TEM de acionar o job linux; senão um PR passa verde e o
// beta quebra 10 minutos depois do merge, que é exatamente o furo que o job existe para fechar.
//
// Entra de graça no `test:tooling` (package.json já roda `bun test ./scripts/release`).

const root = join(import.meta.dir, '..', '..')
const beta = parse(readFileSync(join(root, '.github/workflows/release-beta.yml'), 'utf8'))
const correctness = readFileSync(join(root, '.github/workflows/correctness.yml'), 'utf8')

// A âncora é o grep do step `filter` — se o step for reescrito sem esse formato, o rail
// falha alto em vez de passar vazio.
const anchor = correctness.match(/grep -Eq '([^']+)' "\$RUNNER_TEMP\/changed\.txt"/)
if (!anchor) throw new Error('correctness.yml: step `filter` sem o grep esperado — o rail perdeu a âncora')
const filter = new RegExp(anchor[1])

describe('workflow-paths (rail correctness ↔ release-beta)', () => {
	it('todo caminho que dispara o release-beta aciona o job linux de correctness', () => {
		const paths: string[] = beta.on.push.paths
		expect(paths.length).toBeGreaterThan(0)
		for (const glob of paths) {
			// O self-path de cada workflow é próprio dele — o de correctness é testado abaixo.
			if (glob === '.github/workflows/release-beta.yml') continue
			const sample = `${glob.replace(/\/\*\*$/, '/')}x`
			expect(filter.test(sample)).toBe(true)
		}
	})

	it('o superset deliberado também aciona: scripts/release/ (o smoke vive lá) e o próprio workflow', () => {
		expect(filter.test('scripts/release/smoke-sidecars.ts')).toBe(true)
		expect(filter.test('.github/workflows/correctness.yml')).toBe(true)
	})

	it('fixture negativa: docs/specs não acionam o job linux', () => {
		for (const doc of ['docs/RELEASE.md', '.specs/2026-08-25-x.md', 'README.md', 'docs/x.md']) {
			expect(filter.test(doc)).toBe(false)
		}
	})
})
