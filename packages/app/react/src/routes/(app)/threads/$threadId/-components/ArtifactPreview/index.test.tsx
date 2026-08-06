import { afterEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/lib/i18n'
import { ArtifactPreview, artifactContentUrl, type Artifact } from './index'

const THREAD = '019e4d24-6524-7041-9e1c-8108180cddae'
const ARTIFACT = '019e4d24-6524-7041-9e1c-8108180cddaf'

function artifact(overrides: Partial<Artifact> = {}): Artifact {
	return {
		artifactId: ARTIFACT,
		kind: 'IMAGE',
		name: 'shot.png',
		ref: '/tmp/shot.png',
		meta: '',
		recordedAt: '2026-08-06T11:00:00.000Z',
		...overrides,
	}
}

describe('ArtifactPreview — cada kind é renderizado como ele mesmo', () => {
	let root: Root | null = null
	let host: HTMLElement | null = null

	afterEach(async () => {
		await act(async () => {
			root?.unmount()
		})
		root = null
		host?.remove()
		host = null
	})

	function render(subject: Artifact): HTMLElement {
		host = document.createElement('div')
		document.body.appendChild(host)
		root = createRoot(host)
		act(() => {
			root!.render(<ArtifactPreview artifact={subject} threadId={THREAD} />)
		})
		return host
	}

	it('IMAGE vira uma <img> apontada para o endpoint de conteúdo', () => {
		const el = render(artifact({ kind: 'IMAGE' }))

		const img = el.querySelector('img')
		expect(img).not.toBeNull()
		expect(img!.getAttribute('src')).toBe(artifactContentUrl(THREAD, ARTIFACT))
	})

	it('VIDEO vira um <video> com controles', () => {
		const el = render(artifact({ kind: 'VIDEO', name: 'clip.mp4', ref: '/tmp/clip.mp4' }))

		const video = el.querySelector('video')
		expect(video).not.toBeNull()
		expect(video!.hasAttribute('controls')).toBe(true)
		expect(video!.getAttribute('src')).toBe(artifactContentUrl(THREAD, ARTIFACT))
	})

	it('AUDIO vira um <audio> com controles', () => {
		const el = render(artifact({ kind: 'AUDIO', name: 'note.m4a', ref: '/tmp/note.m4a' }))

		const audio = el.querySelector('audio')
		expect(audio).not.toBeNull()
		expect(audio!.hasAttribute('controls')).toBe(true)
	})

	/**
	 * O `ref` de um LINK É o artefato — o endpoint de conteúdo recusa esse kind de propósito (não há
	 * bytes locais), então o href tem que ser a URL crua e não a rota do daemon.
	 */
	it('LINK vira uma âncora para a própria URL, em aba nova', () => {
		const el = render(artifact({ kind: 'LINK', name: 'preview', ref: 'https://acme-pr-214.vercel.app' }))

		const anchor = el.querySelector('a')
		expect(anchor).not.toBeNull()
		expect(anchor!.getAttribute('href')).toBe('https://acme-pr-214.vercel.app')
		expect(anchor!.getAttribute('target')).toBe('_blank')
		expect(el.querySelector('img')).toBeNull()
	})

	it('FILE vira uma linha que abre pelo endpoint de conteúdo', () => {
		const el = render(artifact({ kind: 'FILE', name: 'report.pdf', ref: '/tmp/report.pdf' }))

		const anchor = el.querySelector('a')
		expect(anchor!.getAttribute('href')).toBe(artifactContentUrl(THREAD, ARTIFACT))
		expect(el.textContent).toContain('/tmp/report.pdf')
	})

	/**
	 * ARQUIVO SUMIDO É UM DESFECHO NORMAL, não um erro: agentes escrevem em `/tmp`, que é varrido.
	 * Disparar `error` na imagem é exatamente o que o navegador faz quando o endpoint responde 404, e
	 * o que sobra de útil é o path — não o ícone de imagem quebrada.
	 */
	it('imagem que falha ao carregar cai para a linha de arquivo com o path', async () => {
		const el = render(artifact({ kind: 'IMAGE' }))

		const img = el.querySelector('img')!
		await act(async () => {
			img.dispatchEvent(new Event('error'))
		})

		expect(el.querySelector('img')).toBeNull()
		expect(el.textContent).toContain('/tmp/shot.png')
		expect(el.querySelector('a')!.getAttribute('href')).toBe(artifactContentUrl(THREAD, ARTIFACT))
	})
})

describe('artifactContentUrl', () => {
	/** O path vem da query key da SDK; o que o cliente acrescenta é só a origem, que é dele. */
	it('substitui os dois params na rota gerada', () => {
		expect(artifactContentUrl(THREAD, ARTIFACT)).toEndWith(`/v1/threads/${THREAD}/artifacts/${ARTIFACT}/content`)
	})
})
