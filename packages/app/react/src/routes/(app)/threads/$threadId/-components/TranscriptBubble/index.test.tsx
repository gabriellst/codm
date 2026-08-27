import { describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/lib/i18n'
import { daemonBaseUrl } from '@/lib/config'
import { contactAvatarUrl } from '@/components/console/ThreadAvatar'
import { composeStories } from '../../../../../../../tests/support/storybook'
import * as stories from './index.stories'

/**
 * A STORY É A FIXTURE; ESTE ARQUIVO SÓ A EXECUTA SOB `bun test` (T10, onda B).
 *
 * `TranscriptBubble` é dumb/props-only — TODAS as asserções visuais/comportamentais do antigo
 * `index.test.tsx` migraram para `play` em `index.stories.tsx`. Este bloco só monta cada story (mesmo
 * padrão do smoke) e invoca o `play` dela.
 */
const composed = composeStories(stories)

describe('TranscriptBubble — stories', () => {
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
 * `contactAvatarUrl` é um módulo PURO, sem tela — fica colocado (boundary rule da skill), nunca vira
 * story. A url que o `<img>` aponta: o ÚNICO lugar do console que endereça o endpoint de avatar do
 * daemon, o JID nele carrega um `@` que precisa sobreviver como segmento de path, e o path em si tem
 * que continuar vindo da query key gerada da SDK em vez de um literal que desvia quando a rota do
 * controller muda.
 */
describe('contactAvatarUrl — the daemon serves the photo, never the platform CDN', () => {
	const CHANNEL = '019e4d24-6524-7041-9e1c-8108180cddaf'
	const ADA_JID = '5511900000001@s.whatsapp.net'

	it('addresses the daemon origin on the SDK’s own path', () => {
		const url = contactAvatarUrl(CHANNEL, ADA_JID)

		expect(url.startsWith(daemonBaseUrl())).toBe(true)
		expect(url).toContain(`/ui/avatars/${CHANNEL}/`)
		// `pps.whatsapp.net` appears nowhere: the CSP does not allow it and the signed url expires.
		expect(url).not.toContain('whatsapp.net/')
	})

	it('encodes the JID — an `@` is not a path separator, but it is not literal either', () => {
		expect(contactAvatarUrl(CHANNEL, ADA_JID)).toEndWith(encodeURIComponent(ADA_JID))
	})
})
