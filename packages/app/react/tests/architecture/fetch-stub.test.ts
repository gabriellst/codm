// O INVENTÁRIO abaixo é preenchido NO MOMENTO DA EXECUÇÃO desta Task: rode o glob uma vez, liste
// os ofensores REAIS de hoje (esperados: os testes atuais que fazem `globalThis.fetch =`), e cole
// os caminhos. A onda B esvazia a lista; o estado final é [] (spec AC-5).
import { describe, expect, it } from 'bun:test'
import { Glob } from 'bun'

/**
 * RAIL COM INVENTÁRIO (spec AC-5, padrão da varredura de rename): stub manual de
 * `globalThis.fetch` fora do inventário falha nomeando o arquivo. O inventário nasce com os
 * ofensores de HOJE — sem ele, o commit atômico de tooling jamais sairia verde sozinho
 * (Decision 15) — e a onda B o esvazia até []. A fronteira de rede sancionada é o harness de
 * integração (padrão) ou MSW (estados improduzíveis + Storybook).
 */
const INVENTORY: readonly string[] = [
	'src/components/Header/UserProfile/index.test.tsx',
	'src/routes/(app)/dashboard/-components/SetupChecklist/index.test.tsx',
	'src/routes/onboarding/-components/OnboardingFlow/index.test.tsx',
]

describe('rail: stub manual de fetch só no inventário (que só encolhe)', () => {
	it('nenhum ofensor fora do inventário', () => {
		const glob = new Glob('src/**/*.test.{ts,tsx}')
		const offenders: string[] = []
		for (const file of glob.scanSync({ cwd: `${import.meta.dir}/../..` })) {
			const source = require('node:fs').readFileSync(`${import.meta.dir}/../../${file}`, 'utf8') as string
			if (/globalThis\.fetch\s*=/.test(source) && !INVENTORY.includes(file)) offenders.push(file)
		}
		expect(offenders).toEqual([])
	})

	it('o inventário não acumula entradas mortas', () => {
		const fs = require('node:fs')
		const stale = INVENTORY.filter(file => {
			const path = `${import.meta.dir}/../../${file}`
			return !fs.existsSync(path) || !/globalThis\.fetch\s*=/.test(fs.readFileSync(path, 'utf8'))
		})
		expect(stale).toEqual([])
	})
})
