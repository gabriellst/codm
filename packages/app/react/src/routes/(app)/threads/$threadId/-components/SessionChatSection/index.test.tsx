import { configureClient } from '@codm/client-typescript/http'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/lib/i18n'
import { installVirtualLayout, silenceLibraryFlushSyncWarning } from '../../../../../../../tests/support/virtualLayout'
import { SessionChatSection } from './index'
import type { Artifact } from '../ArtifactPreview'

/**
 * THE TRANSCRIPT IS WINDOWED — asserted on the SCREEN, not on the primitive.
 *
 * `virtual-list.test.tsx` proves the primitive windows, anchors and sticks. It cannot prove that THIS
 * screen uses it, and that is the regression worth guarding: the section shipped as a plain
 * `data.transcript.map(...)`, and reverting it to one would be a two-line edit that no type-check
 * catches. So this mounts the REAL section against the REAL generated SDK hook and counts bubbles.
 *
 * The stub sits at `fetch`, the repo's existing seam for this (see `SupervisionGate.test.tsx`) —
 * never `mock.module`, whose registry is per-process in bun and would leak into every other suite.
 *
 * Entries are all `CONTACT` on purpose: that branch of `TranscriptBubble` renders no `<Link>`, so the
 * case needs no router. A kind that links would need a real router instance and `await router.load()`
 * before render, which is a different (and much heavier) test than "is the list windowed".
 *
 * What this does NOT claim: that the chat LOOKS right. happy-dom runs no layout, so the `min-h-0`
 * flex chain that gives the scroller its height is not verifiable here at any price — that one is
 * eyes-on-screen, and it is called out as such in the hand-off.
 *
 * PERMANECE REDUZIDO, MAS NÃO MIGRA PARA `play` (T10, onda B — decisão registrada, não um
 * esquecimento). A seção GANHOU `index.stories.tsx` (SÓ-VISUAL — MSW não intercepta sob bun, medido)
 * para a metade "tem tela → story" da boundary rule. O COMPORTAMENTO daqui — janela virtualizada com
 * 1000 linhas, altura de rolagem, âncora na última mensagem, intercalação por horário — não é
 * reproduzível pelo harness de integração: `@codm/api-typescript/testing` (tooling CONGELADO nesta
 * task) só reexporta `createGivenHelpers`/`givenThread`; não existe `given` para popular transcript
 * ou artefatos, então o backend real não tem como responder 1000 entradas sintéticas num timestamp
 * escolhido. `spyOn(globalThis, 'fetch')` não é a atribuição manual que o rail de
 * `fetch-stub.test.ts` proíbe (a regex casa só a atribuição direta) — nunca esteve no INVENTORY, e
 * aqui ele injeta DADOS (volume, timing), nunca é o alvo da asserção (ao contrário do
 * `ThreadSettingsDialog` antigo, que asseverava o PUT/DELETE em si — esse migrou para o harness).
 * Candidato a follow-up de tooling (um `given` de transcript/artefato) fora do escopo desta task.
 */

// A real absolute base URL so ky builds a real Request; the spy is what stops it from leaving.
configureClient({ typescript: 'http://127.0.0.1:65535' })

const THREAD = '019e4d24-6524-7041-9e1c-8108180cddae'

/** Viewport and row height for the emulated layout — 600/88 ≈ 7 rows visible. */
const VIEWPORT = 600
const ROW_HEIGHT = 88

function transcript(count: number) {
	return Array.from({ length: count }, (_, i) => ({
		entryId: `019e4d24-6524-7041-9e1c-${String(i).padStart(12, '0')}`,
		kind: 'CONTACT' as const,
		text: `mensagem ${i}`,
		at: '10:00',
	}))
}

describe('SessionChatSection — 1000 mensagens não são 1000 subárvores de DOM', () => {
	let root: Root | null = null
	let host: HTMLElement | null = null
	let client: QueryClient | null = null
	let restores: (() => void)[] = []
	let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>

	beforeEach(() => {
		restores = [installVirtualLayout({ viewport: VIEWPORT, rowHeight: () => ROW_HEIGHT }), silenceLibraryFlushSyncWarning()]
	})

	afterEach(async () => {
		await act(async () => {
			root?.unmount()
			await new Promise(resolve => setTimeout(resolve, 20))
		})
		root = null
		host?.remove()
		host = null
		client = null
		fetchSpy.mockRestore()
		for (const restore of restores.reverse()) restore()
		restores = []
	})

	function json(body: unknown): Response {
		return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
	}

	/** Answer the three reads this section mounts; anything else would be a surprise worth failing on. */
	function seed(entries: ReturnType<typeof transcript>, artifacts: Artifact[] = []): void {
		fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async input => {
			const url = String(input instanceof Request ? input.url : input)
			if (url.includes('/needs-you')) return json({ stops: [] })
			if (url.includes('/artifacts')) return json({ artifacts })
			if (url.includes('/chat')) return json({ composerMode: 'DIRECT', activeStops: [], transcript: entries })
			throw new Error(`unexpected request: ${url}`)
		})
	}

	/**
	 * Three act windows: the query resolves in one, the section re-renders with data in the next, and
	 * the virtualizer's measurement pass lands in the third. Inside each the wait is on the CLIENT
	 * settling rather than on a fixed clock.
	 */
	async function render(entries: ReturnType<typeof transcript>, artifacts: Artifact[] = []): Promise<HTMLElement> {
		seed(entries, artifacts)
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		client = queryClient
		host = document.createElement('div')
		document.body.appendChild(host)
		root = createRoot(host)
		act(() => {
			root!.render(
				<QueryClientProvider client={queryClient}>
					<SessionChatSection threadId={THREAD} />
				</QueryClientProvider>,
			)
		})
		for (let pass = 0; pass < 3; pass++) {
			await act(async () => {
				for (let i = 0; i < 40; i++) {
					await new Promise(resolve => setTimeout(resolve, 5))
					if (client?.isFetching() === 0) break
				}
			})
		}
		return host!
	}

	const bubbles = (el: HTMLElement) => el.querySelectorAll('[data-slot="virtual-list-item"]')

	/**
	 * THE CEILING IS 40, the same number and the same derivation as the primitive's own test:
	 * ceil(600/88) = 7 visible plus 8 overscan on each side = 23, and `rangeExtractor` returns no more.
	 * 40 absorbs a measurement pass; a reverted `.map()` is 1000, so nothing plausible fits between.
	 */
	it('monta a seção com 1000 entradas e o DOM fica muito abaixo de 1000', async () => {
		const el = await render(transcript(1_000))

		const scroller = el.querySelector('[data-slot="virtual-list"]')
		expect(scroller, 'a seção precisa render uma VirtualList, não um .map()').not.toBeNull()

		const count = bubbles(el).length
		expect(count).toBeLessThanOrEqual(40)
		// Não-vacuidade: zero bolhas satisfaria "menos que 40" renderizando nada.
		expect(count).toBeGreaterThanOrEqual(5)
	})

	/** E a barra de rolagem corresponde às 1000 — 1000 × 88px — e não à janela montada. */
	it('a altura de rolagem corresponde às 1000 entradas', async () => {
		const el = await render(transcript(1_000))
		const scroller = el.querySelector('[data-slot="virtual-list"]') as HTMLElement

		expect(scroller.scrollHeight).toBe(1_000 * ROW_HEIGHT)
	})

	/** A conversa abre na mensagem mais nova, que é o ponto de uma lista ancorada no fim. */
	it('abre na última mensagem, não na primeira', async () => {
		const el = await render(transcript(1_000))
		const indices = [...bubbles(el)].map(b => Number(b.getAttribute('data-index')))

		expect(indices).toContain(999)
		expect(indices).not.toContain(0)
	})

	/**
	 * O estado vazio continua sendo o estado vazio — não uma lista virtual de zero linhas.
	 *
	 * A asserção é no `data-slot` do primitivo `Empty`, não no texto: a cópia é traduzida (e nos
	 * testes o i18next cai no inglês), então casar string prenderia o teste ao idioma do fallback e
	 * ao gosto do founder pela frase, nenhum dos dois sendo o comportamento em questão.
	 */
	it('sem transcript, mostra o empty state e nenhuma lista', async () => {
		const el = await render(transcript(0))

		expect(el.querySelector('[data-slot="virtual-list"]')).toBeNull()
		expect(el.querySelector('[data-slot="empty"]')).not.toBeNull()
	})

	/**
	 * O ARTEFATO APARECE NA CONVERSA, NO INSTANTE EM QUE FOI PRODUZIDO.
	 *
	 * A linha do tempo é composta AQUI (a conversa e os artefatos são duas leituras independentes —
	 * ver o docblock de `TimelineItem` para por que o backend não as funde), então o que precisa de
	 * prova é a fusão: a imagem entra ENTRE as duas mensagens cujos horários a cercam, e não no fim
	 * da lista nem numa aba separada.
	 */
	function artifactAt(recordedAt: string, overrides: Partial<Artifact> = {}): Artifact {
		return {
			artifactId: `019e4d24-6524-7041-9e1c-9${recordedAt.slice(-11).replace(/\D/g, '')}`.slice(0, 36),
			kind: 'IMAGE',
			name: 'shot.png',
			ref: '/tmp/shot.png',
			meta: '',
			recordedAt,
			...overrides,
		}
	}

	function entryAt(id: string, at: string) {
		return { entryId: `019e4d24-6524-7041-9e1c-${id.padStart(12, '0')}`, kind: 'CONTACT' as const, text: `mensagem ${id}`, at }
	}

	it('intercala o artefato entre as mensagens, pela hora em que foi gravado', async () => {
		const entries = [entryAt('1', '2026-08-06T10:00:00.000Z'), entryAt('2', '2026-08-06T12:00:00.000Z')]
		const el = await render(entries, [artifactAt('2026-08-06T11:00:00.000Z')])

		const rows = [...bubbles(el)]
		expect(rows).toHaveLength(3)
		// A do meio é o artefato: é a única linha que carrega uma imagem.
		expect(rows[1]!.querySelector('img')).not.toBeNull()
		expect(rows[0]!.textContent).toContain('mensagem 1')
		expect(rows[2]!.textContent).toContain('mensagem 2')
	})

	/** Uma conversa sem transcript mas COM artefato não é uma conversa vazia. */
	it('um artefato sozinho já é uma linha do tempo', async () => {
		const el = await render(transcript(0), [artifactAt('2026-08-06T11:00:00.000Z')])

		expect(el.querySelector('[data-slot="empty"]')).toBeNull()
		expect(bubbles(el)).toHaveLength(1)
	})
})
