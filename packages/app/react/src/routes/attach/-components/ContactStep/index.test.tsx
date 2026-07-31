import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configureClient } from '@codm/client-typescript/http'
import { enumLabel } from '@/lib'
import { ContactStep } from '.'

/**
 * THE SEARCH MUST REACH THE SERVER.
 *
 * The founder's report was "pesquiso qualquer nome e não aparece; não vi nenhuma request". Both
 * halves of that sentence were true and the second explains the first: the step filtered
 * `contacts.filter(...)` over the array it had been handed, and the browser only ever holds ONE PAGE
 * — `CONTACTS_PAGE_SIZE = 30` rows ordered `lastMessageAt DESC` (`GetAttachThreadWizard`). Anyone
 * outside the 30 most recent counterparties was unreachable by a search box that never asked.
 *
 * The endpoint has taken `search` since it was written (`query.search` → `like(lower(remotes.name))`,
 * covered by `GetAttachThreadWizard.test.ts` with a deliberately different case), so nothing on the
 * server needed fixing: the capability existed and the console never called it.
 *
 * This asserts at the NETWORK boundary — the URL `ky` actually requests — and not on a spy over the
 * SDK hook. A test that stubbed the hook would keep passing if the component went back to filtering
 * locally, which is precisely the regression being pinned.
 */

const TERM = 'lovelace'
const DEBOUNCE_MS = 300

const EMPTY_WIZARD = { channels: [], workspaces: [], providers: [], contacts: [], contactsNextCursor: null }

const CHANNEL = '019e4d24-6524-7041-9e1c-8108180cdd01'
const contact = (externalId: string, displayName: string, kind: 'USER' | 'GROUP') => ({
	channelId: CHANNEL,
	externalId,
	displayName,
	kind,
	avatarUrl: null,
	lastMessageAt: null,
	participantCount: kind === 'GROUP' ? 12 : null,
	alreadyAttached: false,
})

const TWO_KINDS = {
	...EMPTY_WIZARD,
	contacts: [contact('55110001@c.us', 'Ada Lovelace', 'USER'), contact('55110002@g.us', 'Equipe Berzerk', 'GROUP')],
}

describe('ContactStep — a busca vai ao servidor', () => {
	let root: Root | null = null
	let host: HTMLDivElement | null = null
	let requested: string[] = []
	const realFetch = globalThis.fetch

	let payload: unknown = EMPTY_WIZARD

	beforeEach(() => {
		configureClient({ typescript: 'http://localhost:3030', go: 'http://localhost:3032' })
		requested = []
		payload = EMPTY_WIZARD
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			requested.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
			return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
		}) as typeof globalThis.fetch
	})

	afterEach(() => {
		globalThis.fetch = realFetch
		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null
	})

	function mount(): void {
		host = document.createElement('div')
		document.body.appendChild(host)
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const element = host
		act(() => {
			root = createRoot(element)
			root.render(
				<QueryClientProvider client={queryClient}>
					<ContactStep channelKindById={new Map()} onSubmit={() => {}} />
				</QueryClientProvider>,
			)
		})
	}

	/** Types into the search box the way a person does: one input event, then the debounce elapses. */
	async function search(term: string): Promise<void> {
		const input = host?.querySelector('input')
		if (!input) throw new Error('search input not rendered')
		act(() => {
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
			setter?.call(input, term)
			input.dispatchEvent(new Event('input', { bubbles: true }))
		})
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, DEBOUNCE_MS + 120))
		})
	}

	it('monta pedindo a primeira página — o passo é dono do próprio dado', async () => {
		mount()
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 50))
		})
		expect(requested.some(url => url.includes('/v1/ui/attach-thread-wizard'))).toBe(true)
	})

	it('FALSEADOR — digitar um nome dispara uma request COM o termo, não um filtro em memória', async () => {
		mount()
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 50))
		})
		requested = []

		await search(TERM)

		const searched = requested.filter(url => url.includes(`search=${TERM}`))
		expect(searched.length).toBeGreaterThan(0)
	})

	it('cada linha diz se é contato ou grupo, e os dois rótulos são distintos', async () => {
		payload = TWO_KINDS
		mount()
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 50))
		})

		const rows = [...(host?.querySelectorAll('button[type="button"]') ?? [])]
		expect(rows).toHaveLength(2)

		// O rótulo sai do MESMO `enumLabel` que a linha usa, de propósito: o que precisa falhar quando
		// o badge some é "o tipo está visível", não a redação — que muda com a língua. A primeira
		// versão deste teste comparava as duas linhas entre si e passava com o badge REMOVIDO (o span
		// que envolve o nome duplicava o texto), então ele não provava nada; este falha.
		const userLabel = enumLabel('ContactKind', 'USER')
		const groupLabel = enumLabel('ContactKind', 'GROUP')
		expect(userLabel).not.toBe(groupLabel)

		expect(rows[0]?.textContent).toContain('Ada Lovelace')
		expect(rows[0]?.textContent).toContain(userLabel)
		expect(rows[1]?.textContent).toContain('Equipe Berzerk')
		expect(rows[1]?.textContent).toContain(groupLabel)
	})

	it('não manda `search` vazio na primeira carga — a página 1 é a lista completa, não uma busca por ""', async () => {
		mount()
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 50))
		})
		expect(requested.every(url => !url.includes('search='))).toBe(true)
	})
})
