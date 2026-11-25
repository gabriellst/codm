import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configureClient } from '@codm/client-typescript/http'
import type { GetPanelIdentityQueryResponse, GetPanelIssueQueryResponse } from '@codm/client-typescript/typescript-cloud'
import i18n from '@/lib/i18n'
import { useDialogStore } from '@/stores/useDialogStore'
import { fetchStub } from '../../tests/support/fetchStub'
import { PanelApp } from './PanelApp'
import {
	ISSUE_APP12,
	PANEL_BOARD,
	PANEL_ISSUE_APP12,
	PANEL_ME_MEMBER,
	PANEL_ME_NOBODY,
	PANEL_ME_RELEASER,
	PANEL_MEMBERS,
	PANEL_TOKEN,
	STOP_D1,
} from './panelFixtures'
import { usePanelActionStore } from './usePanelAction'

/**
 * The cloud panel in happy-dom, against the SDK's real generated hooks and client — only the network boundary is
 * stubbed (`fetch`, counted and answered per route), so what is asserted is what the page would send and show.
 * Assertions read the catalog (rail `i18n-assertions`).
 */

const ORIGIN = 'http://panel.test'
const BASE = `/panel/g/${PANEL_TOKEN}`

/** happy-dom starts at about:blank, where the address cannot carry a path or a hash; give it the panel's. */
function setURL(url: string) {
	const happy = 'happyDOM' in window ? window.happyDOM : undefined
	if (!happy || typeof happy !== 'object' || !('setURL' in happy) || typeof happy.setURL !== 'function')
		throw new Error('happy-dom setURL unavailable')
	happy.setURL(url)
}

interface Sent {
	method: string
	path: string
	body: unknown
}

interface Routes {
	board?: { status: number; body?: unknown }
	issue?: GetPanelIssueQueryResponse
	me?: GetPanelIdentityQueryResponse
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let sent: Sent[] = []
let routes: Routes = {}
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>
let root: Root | null = null
let host: HTMLElement | null = null

async function answer(request: Request): Promise<Response> {
	const url = new URL(request.url)
	const path = url.pathname
	const body = request.method === 'GET' ? undefined : JSON.parse((await request.clone().text()) || '{}')
	sent.push({ method: request.method, path, body })
	if (path === `${BASE}/board`) return json(routes.board?.body ?? PANEL_BOARD, routes.board?.status ?? 200)
	if (path === `${BASE}/me`) return json(routes.me ?? PANEL_ME_RELEASER)
	if (path === `${BASE}/members`) return json(PANEL_MEMBERS)
	if (path === `${BASE}/issues/${ISSUE_APP12}`) return json(routes.issue ?? PANEL_ISSUE_APP12)
	if (path === `${BASE}/actions` && request.method === 'POST')
		return json({ actionId: '9a9a9a9a-1a2b-4c3d-8e4f-000000000001', status: 'PENDING' })
	if (path.startsWith(`${BASE}/actions/`)) return json({ actionId: path.split('/').pop(), kind: 'ANSWER_ASK', status: 'PENDING' })
	if (path === `${BASE}/identify`) return json({})
	if (path === `${BASE}/verify`) return json({ member: { memberId: 'member-ana', name: 'Ana Ribeiro', canRelease: true } })
	return json({ code: 'PANEL_NOT_FOUND' }, 404)
}

async function mount(hash = '') {
	setURL(`${ORIGIN}${BASE}${hash}`)
	host = document.createElement('div')
	document.body.appendChild(host)
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	await act(async () => {
		root = createRoot(host as HTMLElement)
		root.render(
			<QueryClientProvider client={client}>
				<PanelApp token={PANEL_TOKEN} />
			</QueryClientProvider>,
		)
	})
}

/** Waits (inside act) until `find` returns something — the queries resolve over a few ticks. */
async function waitFor<T>(find: () => T | null | undefined | false, timeoutMs = 3000): Promise<T> {
	const started = Date.now()
	for (;;) {
		const found = find()
		if (found) return found
		if (Date.now() - started > timeoutMs) throw new Error('waitFor: timed out')
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 20))
		})
	}
}

const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)]
const buttonWithText = (text: string) => all('button').find(button => button.textContent?.trim() === text)

async function click(element: HTMLElement) {
	await act(async () => {
		element.click()
	})
}

/** Types into a React-controlled field the way a person does (native setter + input event). */
async function typeInto(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
	await act(async () => {
		setter?.call(input, value)
		input.dispatchEvent(new Event('input', { bubbles: true }))
	})
}

beforeAll(async () => {
	configureClient({ 'typescript-cloud': ORIGIN })
	await i18n.changeLanguage('pt')
})

afterAll(() => {
	// Unset only our own key — other suites keep their configuration.
	configureClient({ 'typescript-cloud': '' })
	// And hand the next suite the address happy-dom started with.
	setURL('about:blank')
})

beforeEach(() => {
	sent = []
	routes = {}
	usePanelActionStore.setState({ last: undefined })
	fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
		fetchStub(async (input, init) => answer(input instanceof Request ? input : new Request(String(input), init))),
	)
})

afterEach(async () => {
	await act(async () => {
		root?.unmount()
		useDialogStore.setState({ content: null, open: false })
		await new Promise(resolve => setTimeout(resolve, 10))
	})
	host?.remove()
	document.body.innerHTML = ''
	root = null
	host = null
	fetchSpy.mockRestore()
})

describe('PanelApp — the cloud panel', () => {
	it('shows the six columns by live state, and a card says its open decision (from the board`s openAsks)', async () => {
		await mount()
		await waitFor(() => all('[data-column]').length === 6)
		const columns = all('[data-column]').map(column => column.dataset.column)
		expect(columns).toEqual(['queued', 'working', 'needsYou', 'waiting', 'stalled', 'done'])
		const needsYou = all('[data-column="needsYou"] [data-testid="panel-task-card"]')
		expect(needsYou.map(card => card.getAttribute('href'))).toEqual(['#APP-12', '#APP-10'])
		expect(needsYou[0]?.textContent).toContain(i18n.t('task.cardMeta.askCode', { code: 'D1', question: 'publico agora ou no fim do dia?' }))
		expect(all('[data-column="working"]')[0]?.textContent).toContain(i18n.t('task.cardMeta.artifacts', { count: 2 }))
		expect(all('[data-column="stalled"]')[0]?.textContent).toContain(i18n.t('task.cardMeta.escalated'))
		expect(document.title).toBe(i18n.t('panel.title', { group: 'Aurora Labs' }))
	})

	it('opens the task the hash names (#APP-12) and closing it clears the hash', async () => {
		await mount('#APP-12')
		const conversation = await waitFor(() => document.querySelector('[data-testid="task-conversation"]'))
		expect(conversation.textContent).toContain('o botão de cupom some no iPhone SE')
		expect(document.querySelector('h1')?.textContent).toContain('Aurora Labs')
		expect(all('h1').some(h => h.textContent === 'Botão de cupom some no iPhone SE')).toBe(true)
		expect(document.querySelector('[data-testid="panel-artifacts"]')?.textContent).toContain(i18n.t('task.artifactsCount', { count: 4 }))

		const back = await waitFor(() => buttonWithText(i18n.t('panel.task.back')))
		await click(back)
		expect(window.location.hash).toBe('')
		await waitFor(() => all('[data-column]').length === 6)
	})

	it('answering the decision POSTs the exact ANSWER_ASK body, then says the request was sent', async () => {
		await mount('#APP-12')
		const option = await waitFor(() => {
			const button = buttonWithText('Publicar agora')
			return button && !button.hasAttribute('disabled') ? button : undefined
		})
		await click(option)
		const post = await waitFor(() => sent.find(request => request.method === 'POST' && request.path === `${BASE}/actions`))
		expect(post.body).toEqual({ kind: 'ANSWER_ASK', issueId: ISSUE_APP12, stopId: STOP_D1, answer: { kind: 'OPTION', optionId: 'now' } })
		const status = await waitFor(() => document.querySelector('[data-testid="panel-action-status"]'))
		await waitFor(() => status.textContent === i18n.t('panel.action.sent'))
	})

	it('a decision that needs a releaser is shown locked to a member who may not release', async () => {
		routes.me = PANEL_ME_MEMBER
		await mount('#APP-12')
		await waitFor(() => document.querySelector('[data-testid="panel-identity"]'))
		const option = await waitFor(() => buttonWithText('Publicar agora'))
		expect(option.hasAttribute('disabled')).toBe(true)
		expect(document.querySelector('[data-testid="task-ask"]')?.textContent).toContain(i18n.t('session.ask.releaseRequired'))
		await click(option)
		expect(sent.some(request => request.method === 'POST')).toBe(false)
	})

	it('identifying posts /identify with the chosen name, then /verify with the code', async () => {
		routes.me = PANEL_ME_NOBODY
		await mount()
		const identify = await waitFor(() => buttonWithText(i18n.t('panel.identity.identify')))
		await click(identify)
		const send = await waitFor(() => buttonWithText(i18n.t('panel.identify.send')))
		await click(send)
		const identifyPost = await waitFor(() => sent.find(request => request.path === `${BASE}/identify`))
		expect(identifyPost.body).toEqual({ memberId: 'member-ana' })

		const code = await waitFor(() =>
			document.querySelector<HTMLInputElement>('[data-testid="panel-identify"] input[autocomplete="one-time-code"]'),
		)
		expect(document.querySelector('[data-testid="panel-identify"]')?.textContent).toContain(
			i18n.t('panel.identify.sent', { name: 'Ana Ribeiro' }),
		)
		await typeInto(code, '48 12 35')
		const confirm = await waitFor(() => {
			const button = buttonWithText(i18n.t('panel.identify.confirm'))
			return button && !button.hasAttribute('disabled') ? button : undefined
		})
		await click(confirm)
		const verifyPost = await waitFor(() => sent.find(request => request.path === `${BASE}/verify`))
		expect(verifyPost.body).toEqual({ memberId: 'member-ana', code: '481235' })
	})

	it('opens the batch dialog on #L-31, with each item`s destination from the catalog', async () => {
		await mount('#L-31')
		const dialog = await waitFor(() => document.querySelector('[data-testid="panel-batch"]'))
		expect(dialog.textContent).toContain(i18n.t('panel.batch.title', { code: 'L-31' }))
		expect(dialog.textContent).toContain(i18n.t('enums.BatchStatus.INCOMPLETE'))
		expect(dialog.textContent).toContain(
			i18n.t('panel.batch.item', { n: 1, destination: i18n.t('enums.BatchItemDestinationKind.NEW_ISSUE') }),
		)
		expect(dialog.textContent).toContain('fora do escopo deste grupo')
		expect(dialog.textContent).toContain(i18n.t('panel.batch.item', { n: 4, destination: i18n.t('panel.batch.noDestination') }))
	})

	it('an invalid link (the board answers 404) shows only that', async () => {
		routes.board = { status: 404, body: { code: 'PANEL_NOT_FOUND' } }
		await mount()
		const invalid = await waitFor(() => document.querySelector('[data-testid="panel-invalid-link"]'))
		expect(invalid.textContent).toContain(i18n.t('panel.invalidLink.title'))
		expect(document.querySelector('[data-column]')).toBeNull()
	})
})
