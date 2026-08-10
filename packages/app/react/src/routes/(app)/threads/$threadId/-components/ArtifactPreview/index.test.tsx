import { describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/lib/i18n'
import { composeStories } from '../../../../../../../tests/support/storybook'
import { artifactContentUrl } from './index'
import * as stories from './index.stories'

/**
 * A STORY É A FIXTURE; ESTE ARQUIVO SÓ A EXECUTA SOB `bun test` (T10, onda B).
 *
 * `ArtifactPreview` é dumb/props-only (nenhum SDK hook nem rota) — TODAS as asserções do antigo
 * `index.test.tsx` migraram para `play` em `index.stories.tsx`. Este bloco só monta cada story (mesmo
 * padrão do smoke) e invoca o `play` dela — o `bun:test` `it()` propaga qualquer `expect` que falhar
 * dentro do `play`.
 */
const composed = composeStories(stories)

describe('ArtifactPreview — stories', () => {
	for (const [name, Story] of Object.entries(composed)) {
		it(name, async () => {
			const host = document.createElement('div')
			document.body.appendChild(host)
			let root: Root | null = null
			await act(async () => {
				root = createRoot(host)
				root.render(<Story />)
			})
			await act(async () => {
				await Promise.resolve()
			})
			await act(async () => {
				await Story.play?.({ canvasElement: host })
			})
			act(() => root?.unmount())
			host.remove()
		})
	}
})

/**
 * `artifactContentUrl` é um módulo PURO, sem tela — fica colocado (boundary rule da skill), nunca
 * vira story.
 */
describe('artifactContentUrl', () => {
	const THREAD = '019e4d24-6524-7041-9e1c-8108180cddae'
	const ARTIFACT = '019e4d24-6524-7041-9e1c-8108180cddaf'

	/** O path vem da query key da SDK; o que o cliente acrescenta é só a origem, que é dele. */
	it('substitui os dois params na rota gerada', () => {
		expect(artifactContentUrl(THREAD, ARTIFACT)).toEndWith(`/v1/threads/${THREAD}/artifacts/${ARTIFACT}/content`)
	})
})

/**
 * ARQUIVO SUMIDO É UM DESFECHO NORMAL, não um erro: agentes escrevem em `/tmp`, que é varrido.
 * Disparar `error` na imagem é exatamente o que o navegador faz quando o endpoint responde 404, e o
 * que sobra de útil é o path — não o ícone de imagem quebrada.
 *
 * NÃO CABE EM `play` — MEDIDO, não suposto: o runner fino acima invoca `Story.play()` dentro de um
 * `act()` assíncrono; `error`/`load` de mídia não são eventos DISCRETOS (diferente de um clique), e
 * React só aplica `setBroken(true)` quando o `act` MAIS EXTERNO fecha — nenhuma asserção dentro do
 * próprio `play` observa o fallback (falseado manualmente: a mesma asserção dentro de `play` ficava
 * VERDE mesmo com o `<img>` ainda montado). Este é o "mount mínimo ao redor da mesma story composta"
 * que a skill prevê para esse caso — reaproveita os args da story `Image`, fora do `act()` do runner.
 */
describe('ArtifactPreview — imagem que falha ao carregar', () => {
	it('cai para a linha de arquivo com o path', async () => {
		const { Image } = composed
		const host = document.createElement('div')
		document.body.appendChild(host)
		let root: Root | null = null
		await act(async () => {
			root = createRoot(host)
			root.render(<Image />)
		})

		const img = host.querySelector('img')
		expect(img).not.toBeNull()
		await act(async () => {
			img?.dispatchEvent(new Event('error'))
		})

		expect(host.querySelector('img')).toBeNull()
		expect(host.textContent).toContain('/tmp/shot.png')

		act(() => root?.unmount())
		host.remove()
	})
})
