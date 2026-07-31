import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configureClient } from '@codm/client-typescript/http'
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

describe('ContactStep — a busca vai ao servidor', () => {
	let root: Root | null = null
	let host: HTMLDivElement | null = null
	let requested: string[] = []
	const realFetch = globalThis.fetch

	beforeEach(() => {
		configureClient({ typescript: 'http://localhost:3030', go: 'http://localhost:3032' })
		requested = []
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			requested.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
			return new Response(JSON.stringify(EMPTY_WIZARD), { status: 200, headers: { 'content-type': 'application/json' } })
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

	it('não manda `search` vazio na primeira carga — a página 1 é a lista completa, não uma busca por ""', async () => {
		mount()
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 50))
		})
		expect(requested.every(url => !url.includes('search='))).toBe(true)
	})
})
