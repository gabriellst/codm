import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NudgeSource, SupervisorVerdict, SuspicionReason } from '@codm/contracts-typescript/wire/enums'
import i18n from '@/lib/i18n'
import { enumLabel } from '@/lib'
import { mountRouter, type MountedRouter } from '../../../../../../../tests/support/mountRouter'
import { loadBackendGivens, useIntegrationBackend, type IntegrationBackend } from '../../../../../../../tests/support/integration-harness'
import { DesktopTaskSurface } from './DesktopTaskSurface'
import { TaskConversationSection } from './TaskConversationSection'

/**
 * Fase 5 (S6) — the autonomy moments in the task conversation (they were the timeline list's before P1), CONTRA O BACKEND REAL: the agent's facts (a nudge, the
 * supervisor's acted escalation, one only observed) are seeded as the agent records them, the real reader assembles
 * the timeline and the SDK hook brings it. Proves each variant's words — "empurrão 1 de 2" with the episode's length
 * from the wire (`outOf`), the supervisor's verdict WITH its reason — and that a verdict only observed never shows.
 * A sanctioned harness-backed sibling (SB-04): a `play` under MSW cannot run the reader.
 */
let backend: IntegrationBackend

beforeAll(async () => {
	backend = await useIntegrationBackend()
})
afterAll(async () => {
	await backend.stop()
})

/** A fact as the agent writes it — the seed shape of `givenDomainEvent` (name, payload, the issue as entity). */
function fact(name: string, issueId: string, ownerId: string, payload: object) {
	const event = { name, id: crypto.randomUUID(), time: new Date().toISOString(), payload, entityId: issueId, ownerId }
	return { ...event, toJSON: () => event, serialize: () => JSON.stringify(event) }
}

describe('TaskConversationSection — fase 5, contra o backend real', () => {
	let mounted: MountedRouter | null = null

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		await backend.reset()
	})
	afterEach(() => {
		mounted?.unmount()
		mounted = null
	})

	it('shows the nudge as "n de m" and what the supervisor did with why — never a verdict only observed', async () => {
		const { givenThread, givenIssue, givenDomainEvent } = await loadBackendGivens()
		const bed = backend.asTestBed()
		const thread = (await givenThread(bed, {})) as { id: { value: string } }
		const issue = (await givenIssue(bed, { threadId: thread.id.value, key: 'APP-21' })) as { id: { value: string } }
		const issueId = issue.id.value
		const threadId = thread.id.value
		await givenDomainEvent(
			bed,
			fact('agent.issue.nudged', issueId, backend.ownerId, {
				issueId,
				threadId,
				ordinal: 1,
				source: NudgeSource.RECONCILER,
				rootItemId: issueId,
			}),
		)
		await givenDomainEvent(
			bed,
			fact('agent.supervisor.reviewed', issueId, backend.ownerId, {
				issueId,
				reason: SuspicionReason.STALLED_OPEN,
				verdict: SupervisorVerdict.ESCALATE,
				mode: 'ACT', // the agent's own mode enum (never on the wire)
				acted: true,
			}),
		)
		await givenDomainEvent(
			bed,
			fact('agent.supervisor.reviewed', issueId, backend.ownerId, {
				issueId,
				reason: SuspicionReason.NUDGE_LOOP,
				verdict: SupervisorVerdict.RESTART_WITH_NOTES,
				mode: 'OBSERVE',
				acted: false,
			}),
		)

		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		mounted = await mountRouter(
			<QueryClientProvider client={queryClient}>
				<DesktopTaskSurface threadId={threadId} issueId={issueId}>
					<TaskConversationSection threadId={threadId} issueId={issueId} />
				</DesktopTaskSurface>
			</QueryClientProvider>,
		)
		const nudged = i18n.t('session.timelineNudged', { ordinal: 1, outOf: 2, source: enumLabel('NudgeSource', NudgeSource.RECONCILER) })
		await mounted.settled(() => document.body.textContent?.includes(nudged) ?? false, 'o empurrão aparecer como "1 de 2"')

		const escalated = i18n.t('session.timelineSupervisor', {
			verdict: enumLabel('SupervisorVerdict', SupervisorVerdict.ESCALATE),
			reason: enumLabel('SuspicionReason', SuspicionReason.STALLED_OPEN),
		})
		expect(document.body.textContent).toContain(escalated)
		// Observation is audit, not a moment: the restart only observed is nowhere on the timeline.
		expect(document.body.textContent).not.toContain(enumLabel('SupervisorVerdict', SupervisorVerdict.RESTART_WITH_NOTES))
	})
})
