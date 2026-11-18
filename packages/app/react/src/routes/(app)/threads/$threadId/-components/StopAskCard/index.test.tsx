import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getNeedsYouPanel } from '@codm/client-typescript/typescript'
import { AskAnswerKind, StopKind } from '@codm/contracts-typescript/wire/enums'
import i18n from '@/lib/i18n'
import { mountRouter, type MountedRouter } from '../../../../../../../tests/support/mountRouter'
import { loadBackendGivens, useIntegrationBackend, type IntegrationBackend } from '../../../../../../../tests/support/integration-harness'
import { NeedsYouPanel } from '../NeedsYouPanel'

/**
 * Fase 3 — answering an issue's ask from the console, CONTRA O BACKEND REAL: the Needs-you panel renders
 * the ask per variant (buttons for a decision's options, a text box for a question without them) and the
 * answer goes through `POST /stops/:stopId/answer` — the proof is the stop gone on the real re-read.
 * (MSW is visual-only under bun — `tests/support/storybook.ts` — so the stories show, this file proves.)
 */
let backend: IntegrationBackend

beforeAll(async () => {
	backend = await useIntegrationBackend()
})
afterAll(async () => {
	await backend.stop()
})

describe('StopAskCard — contra o backend real', () => {
	let mounted: MountedRouter | null = null

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		await backend.reset()
	})
	afterEach(() => {
		mounted?.unmount()
		mounted = null
	})

	async function seedAsk(ask: Parameters<Awaited<ReturnType<typeof loadBackendGivens>>['givenStop']>[1]): Promise<string> {
		const { givenThread, givenIssue, givenStop } = await loadBackendGivens()
		const bed = backend.asTestBed()
		const thread = (await givenThread(bed, {})) as { id: { value: string } }
		const issue = (await givenIssue(bed, { threadId: thread.id.value, key: 'APP-12' })) as { id: { value: string } }
		await givenStop(bed, { ...ask, threadId: thread.id.value, issueId: issue.id.value })
		return thread.id.value
	}

	async function mount(threadId: string): Promise<MountedRouter> {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		mounted = await mountRouter(
			<QueryClientProvider client={queryClient}>
				<NeedsYouPanel threadId={threadId} />
			</QueryClientProvider>,
		)
		await mounted.settled(() => document.body.textContent?.includes('APP-12 · D1') ?? false, 'a pergunta aparecer com o código')
		return mounted
	}

	it('uma decisão mostra um botão por opção e responder pelo botão resolve o stop', async () => {
		const threadId = await seedAsk({
			ask: {
				question: 'Uso o tema escuro?',
				options: [
					{ id: 'yes', label: 'Sim' },
					{ id: 'no', label: 'Não' },
				],
				effects: [],
				requested: StopKind.DECISION_REQUESTED,
			},
		})
		await mount(threadId)

		expect(document.querySelector('[data-testid="stop-ask"] textarea')).toBeNull()
		const no = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="stop-ask"] button')].find(b => b.textContent === 'Não')
		await act(async () => {
			no?.click()
		})

		await mounted!.settled(() => document.querySelector('[data-testid="stop-ask"]') === null, 'o pedido sair do painel')
		expect((await getNeedsYouPanel(threadId)).stops).toEqual([])
	})

	it('uma pergunta sem opções é respondida em texto livre, diz com o que segue, e enviar resolve o stop', async () => {
		const threadId = await seedAsk({
			ask: {
				question: 'Qual título uso?',
				options: [],
				default: { kind: AskAnswerKind.TEXT, text: 'Novidades de novembro' },
				effects: [],
				requested: StopKind.QUESTION_ASKED,
			},
		})
		await mount(threadId)

		expect(document.body.textContent).toContain('Novidades de novembro')
		const textarea = document.querySelector<HTMLTextAreaElement>('[data-testid="stop-ask"] textarea')
		const send = document.querySelector<HTMLButtonElement>('[data-testid="stop-ask"] button[type="submit"]')
		// Empty is not a valid TEXT answer (the SDK member's min length): the send stays off.
		expect(send?.disabled).toBe(true)

		const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
		act(() => {
			nativeValue?.call(textarea, 'Novidades de dezembro')
			textarea?.dispatchEvent(new Event('input', { bubbles: true }))
		})
		await mounted!.settled(
			() => document.querySelector<HTMLButtonElement>('[data-testid="stop-ask"] button[type="submit"]')?.disabled === false,
			'o envio liberar com texto válido',
		)
		await act(async () => {
			document.querySelector<HTMLButtonElement>('[data-testid="stop-ask"] button[type="submit"]')?.click()
		})

		await mounted!.settled(() => document.querySelector('[data-testid="stop-ask"]') === null, 'a pergunta sair do painel')
		expect((await getNeedsYouPanel(threadId)).stops).toEqual([])
	})
})
