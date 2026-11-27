import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import i18n from '@/lib/i18n'
import { mountRouter, type MountedRouter } from '../../../../../../../tests/support/mountRouter'
import { loadBackendGivens, useIntegrationBackend, type IntegrationBackend } from '../../../../../../../tests/support/integration-harness'
import { SessionIssuesSection } from '.'

/**
 * P2 — the conversation's kanban, CONTRA O BACKEND REAL (spec 2026-11-24 §4): each task lands in the column of
 * its live state as `GetSessionIssues` computes it — a task waiting on someone under "Precisa de você", a
 * paused one under "Parada" — mounted at its real route so the `done` search param resolves.
 */
let backend: IntegrationBackend

beforeAll(async () => {
	backend = await useIntegrationBackend()
})
afterAll(async () => {
	await backend.stop()
})

describe('SessionIssuesSection — contra o backend real', () => {
	let mounted: MountedRouter | null = null

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		await backend.reset()
	})
	afterEach(() => {
		mounted?.unmount()
		mounted = null
	})

	it('puts each task in the column of its live state', async () => {
		const { givenThread, givenIssue, givenStop } = await loadBackendGivens()
		const bed = backend.asTestBed()
		const thread = (await givenThread(bed, {})) as { id: { value: string } }
		const threadId = thread.id.value
		const waiting = (await givenIssue(bed, { threadId, key: 'APP-1', title: 'Esperando alguém' })) as { id: { value: string } }
		await givenIssue(bed, { threadId, key: 'APP-2', title: 'Pausada', paused: true })
		await givenStop(bed, { threadId, issueId: waiting.id.value, kind: StopKind.APPROVAL_NEEDED })

		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		mounted = await mountRouter(
			<QueryClientProvider client={queryClient}>
				<SessionIssuesSection threadId={threadId} />
			</QueryClientProvider>,
			{ routeId: '/(app)/threads/$threadId/issues/', params: { threadId } },
		)

		const column = (name: string) => document.querySelector(`[data-column="${name}"]`)?.textContent ?? ''
		await mounted.settled(() => column('needsYou').includes('APP-1'), 'a tarefa esperando alguém cair em "Precisa de você"')
		expect(column('stalled')).toContain('APP-2')
		expect(column('working')).not.toContain('APP-1')
		// "Concluída" stays behind its link until asked for.
		expect(document.querySelector('[data-column="done"]')).toBeNull()
		// Each card is a link to its task page.
		const card = [...document.querySelectorAll<HTMLAnchorElement>('[data-testid="task-card"]')].find(a => a.textContent?.includes('APP-1'))
		expect(card?.getAttribute('href')).toContain(waiting.id.value)
	})
})
