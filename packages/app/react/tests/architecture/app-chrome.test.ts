import { describe, expect, it } from 'bun:test'
import { scanPosix } from './support/scan'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * RAIL — A BARRA DE TÍTULO É DA JANELA, ENTÃO ELA MONTA UMA VEZ SÓ, NA RAIZ.
 *
 * O bug do founder: a `AppChrome` não aparecia em `/attach`. A causa não é um estilo nem um
 * `z-index` — é ONDE ela estava montada. Ela vivia em `routes/(app)/route.tsx`, o layout do console
 * autenticado, e `/attach` é uma rota IRMÃ de `(app)`, não filha. `/onboarding` e `/styleguide`
 * também. Nenhuma delas jamais teve a barra: numa janela `titleBarStyle: 'Overlay'` (veja
 * `packages/app/tauri/config/window.ts`) isso significa nenhuma superfície de arraste e os semáforos
 * nativos do macOS caindo por cima do conteúdo da própria tela.
 *
 * A condição de verdade da barra é "esta é a janela principal do desktop", e não "o operador está
 * autenticado" — `Overlay` + `hiddenTitle` + `trafficLightPosition` são propriedades da JANELA, e
 * valem para toda rota React renderizada dentro dela. Por isso a barra sobe para `__root.tsx`.
 *
 * As duas metades desta rail são o conserto E a regressão que o conserto pode causar:
 *   1. `__root.tsx` MONTA a barra          — sem isso nenhuma rota tem barra (o bug original)
 *   2. NINGUÉM MAIS monta                  — subir sem tirar de `(app)` renderiza DUAS barras no
 *                                            console, que é a regressão mais provável deste conserto
 *
 * A splash de boot-error NÃO entra nesta conta: é outra janela (`BOOT_ERROR_FRAME`), HTML puro em
 * `public/boot-error.html`, deliberadamente fora do React — logo, fora de `src/`, que é o que esta
 * rail varre.
 *
 * O predicado é o USO em JSX (`<AppChrome`), não o import: é a montagem que põe a barra na tela, e
 * um import não usado passaria um predicado de import enquanto a janela continua sem poder ser
 * arrastada.
 */

const REACT_SRC = resolve(import.meta.dirname, '../../src')

/** A montagem em JSX — `<AppChrome />` ou `<AppChrome className=...>`. */
const MOUNTS_APP_CHROME = /<AppChrome[\s/>]/

/** O único lugar onde a barra pode ser montada. */
const ROOT = 'routes/__root.tsx'

/** O arquivo que DEFINE o componente — ele não se monta, e não faria sentido cobrá-lo. */
const DEFINITION = 'components/console/AppChrome.tsx'

async function sourceFiles(): Promise<string[]> {
	const entries = await scanPosix('**/*.tsx', REACT_SRC)
	return entries.filter(entry => !/\.(test|stories)\.tsx$/.test(entry) && entry !== DEFINITION).sort()
}

async function mountSites(): Promise<string[]> {
	const files = await sourceFiles()
	return files.filter(f => MOUNTS_APP_CHROME.test(readFileSync(join(REACT_SRC, f), 'utf8')))
}

describe('rail — AppChrome monta exatamente uma vez, na raiz', () => {
	it('a barra é montada em __root.tsx — toda rota da janela principal a herda', async () => {
		expect(await mountSites()).toContain(ROOT)
	})

	it('nenhum outro arquivo monta a barra — duas barras empilhadas no console é a regressão deste conserto', async () => {
		expect(await mountSites()).toEqual([ROOT])
	})

	/**
	 * A rail não pode passar por não achar nada: se o glob quebrar (pasta renomeada, extensão trocada)
	 * `mountSites()` vira `[]` e o primeiro caso falharia, mas o segundo passaria feliz. Este caso
	 * ancora a varredura em fatos que existem hoje.
	 */
	it('a varredura enxerga o app de verdade — a rail não pode passar por varrer o vazio', async () => {
		const files = await sourceFiles()
		expect(files.length).toBeGreaterThanOrEqual(50)
		expect(files).toContain(ROOT)
		// Uma rota irmã de `(app)` (attach mudou-se para DENTRO do grupo no C2/D3 — onboarding
		// segue sendo o exemplo vivo de rota sem a casca) e o próprio layout do grupo.
		expect(files).toContain('routes/onboarding/index.tsx')
		expect(files).toContain('routes/(app)/route.tsx')
	})
})
