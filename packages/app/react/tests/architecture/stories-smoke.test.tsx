// packages/app/react/tests/architecture/stories-smoke.test.tsx — arquivo final COMPLETO.
import { describe, expect, it } from 'bun:test'
import { Glob } from 'bun'
import { act, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { composeStories, ensureProjectAnnotations } from '../support/storybook'

/**
 * TODA STORY É EXECUTÁVEL — o gate que não existia.
 *
 * `storybook:build` não roda em gate nenhum: uma story podia quebrar de vez e ninguém saberia até
 * abrir o Storybook. Este smoke fecha o buraco pelo runner que já roda em todo commit: compõe cada
 * story com as anotações do projeto e a RENDERIZA. Não assevera aparência — assevera que ela
 * existe, compila e monta. `play` é asserção dos arquivos de story; aqui só a montagem.
 *
 * Genérico por construção (Bun.Glob — nenhuma story nomeada), portanto TOOLING (spec Decision 15):
 * um fork herda o gate sem herdar nenhuma story do CODM.
 *
 * As anotações do projeto vêm de `tests/support/storybook.ts` (T4) — aplicadas ali uma vez, não
 * redigitadas aqui (MSW sob bun foi medido e NÃO intercepta, nem via o worker do preview nem via o
 * fallback `msw/node` — ver o comentário completo em `storybook.ts` e a prova viva em
 * `storybook.spike.test.tsx`). `ensureProjectAnnotations()` roda antes do primeiro `composeStories`
 * só para deixar explícito que a montagem abaixo depende delas.
 */
ensureProjectAnnotations()

const glob = new Glob('src/**/*.stories.tsx')
const storyFiles = [...glob.scanSync({ cwd: import.meta.dir + '/../..' })].sort()

describe('smoke: toda story compõe e renderiza', () => {
	expect(storyFiles.length).toBeGreaterThan(0)

	for (const file of storyFiles) {
		it(file, async () => {
			const module_ = await import(`../../${file}`)
			// The dynamic import's specifier is not a literal, so bun/tsc can't statically resolve the
			// module shape — `composeStories` degrades to `unknown` per entry instead of the real
			// `ComposedStoryFn`. The runtime shape (a callable component) is exactly what `composeStories`
			// guarantees; this cast reasserts it for `tsc` without widening what the test can catch.
			const composed = composeStories(module_) as Record<string, ComponentType>
			for (const [name, Story] of Object.entries(composed)) {
				const host = document.createElement('div')
				document.body.appendChild(host)
				const root = createRoot(host)
				await act(async () => {
					root.render(<Story />)
				})
				await act(async () => {
					await Promise.resolve()
				})
				expect(host, `${file} :: ${name} montou vazio`).toBeTruthy()
				act(() => root.unmount())
				host.remove()
			}
		})
	}
})
