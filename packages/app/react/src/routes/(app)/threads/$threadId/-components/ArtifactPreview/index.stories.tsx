import type { Meta, StoryObj } from '@storybook/react'
import { expect } from 'storybook/test'
import { ArtifactPreview, artifactContentUrl, type Artifact } from '.'

/**
 * Migrado de `index.test.tsx` (T10, onda B). `ArtifactPreview` é dumb/props-only — nenhum SDK hook,
 * nenhuma rota; `useDialogStore` só decide o lightbox ao clicar (não coberto pelo teste antigo, e por
 * isso não migrado aqui — ver a regra de escopo do canon). Quase toda asserção do antigo
 * `index.test.tsx` cabe em `play` — ver `index.test.tsx` para o runner fino que as executa sob `bun
 * test`, para o teste do módulo puro `artifactContentUrl` (sem tela, boundary rule da skill), E para
 * o caso "imagem que falha ao carregar" — MEDIDO como incompatível com `play`: o runner fino desta
 * skill invoca `Story.play()` dentro de um `act()` assíncrono já aberto, e um `error`/`load` de mídia
 * não é um evento DISCRETO (ao contrário de um clique) — React só aplica o `setBroken(true)` quando o
 * `act` mais EXTERNO fecha, então nenhuma asserção dentro do próprio `play` consegue observar o
 * fallback. O caso migrou para um mount mínimo ao redor da story `Image` em `index.test.tsx`.
 */

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

const meta = {
	title: 'Console/ArtifactPreview',
	component: ArtifactPreview,
	args: { threadId: THREAD },
} satisfies Meta<typeof ArtifactPreview>
export default meta

type Story = StoryObj<typeof meta>

export const Image: Story = {
	args: { artifact: artifact({ kind: 'IMAGE' }) },
	play: async ({ canvasElement }) => {
		const img = canvasElement.querySelector('img')
		await expect(img).not.toBeNull()
		await expect(img).toHaveAttribute('src', artifactContentUrl(THREAD, ARTIFACT))
	},
}

export const Video: Story = {
	args: { artifact: artifact({ kind: 'VIDEO', name: 'clip.mp4', ref: '/tmp/clip.mp4' }) },
	play: async ({ canvasElement }) => {
		const video = canvasElement.querySelector('video')
		await expect(video).not.toBeNull()
		await expect(video).toHaveAttribute('controls')
		await expect(video).toHaveAttribute('src', artifactContentUrl(THREAD, ARTIFACT))
	},
}

export const Audio: Story = {
	args: { artifact: artifact({ kind: 'AUDIO', name: 'note.m4a', ref: '/tmp/note.m4a' }) },
	play: async ({ canvasElement }) => {
		const audio = canvasElement.querySelector('audio')
		await expect(audio).not.toBeNull()
		await expect(audio).toHaveAttribute('controls')
	},
}

/**
 * O `ref` de um LINK É o artefato — o endpoint de conteúdo recusa esse kind de propósito (não há
 * bytes locais), então o href tem que ser a URL crua e não a rota do daemon.
 */
export const Link: Story = {
	args: { artifact: artifact({ kind: 'LINK', name: 'preview', ref: 'https://acme-pr-214.vercel.app' }) },
	play: async ({ canvasElement }) => {
		const anchor = canvasElement.querySelector('a')
		await expect(anchor).toHaveAttribute('href', 'https://acme-pr-214.vercel.app')
		await expect(anchor).toHaveAttribute('target', '_blank')
		await expect(canvasElement.querySelector('img')).toBeNull()
	},
}

export const File: Story = {
	args: { artifact: artifact({ kind: 'FILE', name: 'report.pdf', ref: '/tmp/report.pdf' }) },
	play: async ({ canvasElement }) => {
		const anchor = canvasElement.querySelector('a')
		await expect(anchor).toHaveAttribute('href', artifactContentUrl(THREAD, ARTIFACT))
		await expect(canvasElement).toHaveTextContent('/tmp/report.pdf')
	},
}
