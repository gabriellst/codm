import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configureClient } from '@codm/client-typescript/http'
import type { GetOperatorIdentityQueryResponse } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { UserProfile } from '.'

/**
 * O CABEÇALHO VESTE A IDENTIDADE DO CANAL — E A DEVOLVE QUANDO O CANAL SAI.
 *
 * A sessão do CODM é uma CONSTANTE (`"Operator"`, `image: null`) e o `SessionSchema` do backend não
 * tem campo de imagem: o nome e o avatar do cabeçalho eram fixos por construção. Agora vêm de
 * `GET /ui/operator`, que resolve `gateway_channels.owner_remote_id` — o JID da própria conta
 * conectada — contra a agenda do gateway.
 *
 * Os dois primeiros casos são os dois lados do EMPRÉSTIMO, e o segundo é o que justifica o desenho:
 * a identidade é tão durável quanto o canal, então a ausência tem de cair no comportamento antigo em
 * silêncio — nunca em erro, nunca em nome vazio.
 *
 * O QUE NÃO É ASSERTADO AQUI, e por quê: que a FOTO aparece. O `Avatar.Image` do Base UI só se revela
 * quando o browser reporta a imagem como `loaded` (ver `useImageLoadingStatus`), e o happy-dom não
 * carrega imagem a preço nenhum — um assert em `<img>` seria teste do dublê de DOM, não deste
 * componente. A metade que quebra em silêncio é a URL, e ela é função pura, coberta em
 * `TranscriptBubble/index.test.tsx` (`contactAvatarUrl`), que é a MESMA função usada aqui.
 */
describe('UserProfile — a identidade emprestada do canal', () => {
	let root: Root | null = null
	let host: HTMLDivElement | null = null
	let requested: string[] = []
	const realFetch = globalThis.fetch

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		configureClient({ typescript: 'http://localhost:3030', go: 'http://localhost:3032' })
		requested = []
	})

	afterEach(() => {
		globalThis.fetch = realFetch
		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null
	})

	function serve(payload: GetOperatorIdentityQueryResponse): void {
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			requested.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
			return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
		}) as typeof globalThis.fetch
	}

	function mount(): void {
		host = document.createElement('div')
		document.body.appendChild(host)
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const element = host
		act(() => {
			root = createRoot(element)
			root.render(
				<QueryClientProvider client={queryClient}>
					<UserProfile />
				</QueryClientProvider>,
			)
		})
	}

	async function settle(ms = 60): Promise<void> {
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, ms))
		})
	}

	/**
	 * FALSEADOR: volte a ler `session.user` no componente e este teste fica vermelho nas duas linhas —
	 * o nome da conta some e o `"Operator"` constante reaparece.
	 */
	it('usa o nome da conta conectada, e não o da sessão constante', async () => {
		serve({
			identity: {
				channelId: '019e4d24-6524-7041-9e1c-8108180cddae',
				externalId: '558386387518@s.whatsapp.net',
				displayName: 'Gabriel Araújo',
				hasAvatar: true,
			},
		})
		mount()
		await settle()

		expect(host?.textContent).toContain('Gabriel Araújo')
		expect(host?.textContent).not.toContain('Operator')
		// As iniciais do nome EMPRESTADO ficam sob a foto — é o que o operador vê enquanto ela carrega,
		// e é o que ele vê para sempre se a conta não tiver foto.
		expect(host?.textContent).toContain('GA')
	})

	/**
	 * TERMO 1 DO EMPRÉSTIMO: canal desconectado, `owner_remote_id` ainda vazio, ou conta ausente da
	 * agenda — o read devolve `identity` ausente e a tela volta a ser a de antes, sem buraco e sem erro.
	 */
	it('cai na sessão constante quando não há identidade a emprestar', async () => {
		serve({})
		mount()
		await settle()

		expect(host?.textContent).toContain('Operator')
		// Iniciais do fallback: o círculo nunca fica vazio.
		expect(host?.textContent).toContain('OperatorO')
	})

	/**
	 * A rota é do READ, não da sessão. Vale asserção própria porque o defeito que este componente
	 * corrige era exatamente ler a fonte errada — e uma fonte errada que responde 200 é invisível numa
	 * asserção só de texto.
	 */
	it('pergunta ao read do operador, não ao endpoint de sessão', async () => {
		serve({})
		mount()
		await settle()

		expect(requested.some(url => url.includes('/v1/ui/operator'))).toBe(true)
	})
})
