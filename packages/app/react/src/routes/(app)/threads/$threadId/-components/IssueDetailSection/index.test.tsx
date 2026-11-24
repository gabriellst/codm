import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getIssueDetail, getNeedsYouPanel } from '@codm/client-typescript/typescript'
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import i18n from '@/lib/i18n'
import { mountRouter, type MountedRouter } from '../../../../../../../tests/support/mountRouter'
import { loadBackendGivens, useIntegrationBackend, type IntegrationBackend } from '../../../../../../../tests/support/integration-harness'
import { IssueDetailSection } from '.'

/**
 * P1 — the task page, CONTRA O BACKEND REAL (spec 2026-11-24 §3): it opens with the task's header, its
 * conversation (the open decision as its card) and the terminal session on the side; answering the decision
 * goes through `POST /stops/:stopId/answer` and a steer through `POST /issues/:issueId/steer` (written to the
 * task's terminal log, shown in the session panel) — each proved by
 * the real re-read, never by the click alone. (MSW is visual-only under bun; the story shows, this file proves.)
 */
let backend: IntegrationBackend

beforeAll(async () => {
	backend = await useIntegrationBackend()
})
afterAll(async () => {
	await backend.stop()
})

describe('IssueDetailSection — contra o backend real', () => {
	let mounted: MountedRouter | null = null

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		await backend.reset()
	})
	afterEach(() => {
		mounted?.unmount()
		mounted = null
	})

	async function seed(): Promise<{ threadId: string; issueId: string }> {
		const { givenThread, givenIssue, givenStop } = await loadBackendGivens()
		const bed = backend.asTestBed()
		const thread = (await givenThread(bed, {})) as { id: { value: string } }
		const issue = (await givenIssue(bed, { threadId: thread.id.value, key: 'APP-12', title: 'Botão de cupom' })) as {
			id: { value: string }
		}
		await givenStop(bed, {
			threadId: thread.id.value,
			issueId: issue.id.value,
			ask: {
				question: 'Publico agora?',
				options: [
					{ id: 'now', label: 'Agora' },
					{ id: 'later', label: 'Depois' },
				],
				effects: [],
				requested: StopKind.DECISION_REQUESTED,
			},
		})
		return { threadId: thread.id.value, issueId: issue.id.value }
	}

	async function mount({ threadId, issueId }: { threadId: string; issueId: string }) {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		mounted = await mountRouter(
			<QueryClientProvider client={queryClient}>
				<IssueDetailSection threadId={threadId} issueId={issueId} />
			</QueryClientProvider>,
		)
		await mounted.settled(() => document.querySelector('[data-testid="task-ask"]') !== null, 'a decisão aparecer na conversa')
	}

	it('opens with the header, the conversation and the terminal session — and answering the decision resolves the stop', async () => {
		const ids = await seed()
		await mount(ids)

		expect(document.body.textContent).toContain('APP-12')
		expect(document.querySelector('[data-testid="task-conversation"]')).not.toBeNull()
		// The ONE terminal panel lives on the side, mounted on load (the e2e specs wait for its live badge).
		expect(document.querySelectorAll('[data-testid="terminal-panel"]')).toHaveLength(1)

		const later = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="task-ask"] button')].find(b => b.textContent === 'Depois')
		await act(async () => {
			later?.click()
		})

		await mounted!.settled(() => document.querySelector('[data-testid="task-ask"]') === null, 'a decisão sair da conversa')
		expect((await getNeedsYouPanel(ids.threadId)).stops).toEqual([])
	}, 30_000)

	it('a steer typed in the field reaches the task and shows in its session', async () => {
		const ids = await seed()
		await mount(ids)

		expect(document.querySelector('[data-slot="steer-composer-input"]')).not.toBeNull()
		// The field is an <input>; typed through its own prototype's setter (the global constructor may belong to
		// another happy-dom window) so React reads the native value on `input`.
		act(() => {
			const field = document.querySelector<HTMLInputElement>('[data-slot="steer-composer-input"]')
			const nativeValue = field ? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set : undefined
			nativeValue?.call(field, 'só no mobile')
			field?.dispatchEvent(new Event('input', { bubbles: true }))
		})
		await mounted!.settled(
			() => document.querySelector<HTMLButtonElement>('[data-slot="steer-composer-send"]')?.disabled === false,
			'o envio liberar com texto',
		)
		await act(async () => {
			document.querySelector<HTMLButtonElement>('[data-slot="steer-composer-send"]')?.click()
		})

		// The console's steer (`POST /issues/:id/steer`) is written to the task's terminal log — it shows in the
		// session panel on the side (the same place the old page showed it), and the field clears.
		// The field clears on the mutation's success (bp-30: the effect rides the hook)…
		await mounted!.settled(
			() => document.querySelector<HTMLInputElement>('[data-slot="steer-composer-input"]')?.value === '',
			'o campo limpar depois do envio',
		)
		// …and the line is on the task's log. (The session panel is a virtual list: happy-dom lays out nothing,
		// so the proof is the real re-read, not the rendered row.)
		const { terminalLog } = await getIssueDetail(ids.issueId)
		expect(terminalLog.some(line => line.line === 'steer: só no mobile')).toBe(true)
	}, 30_000)
})
