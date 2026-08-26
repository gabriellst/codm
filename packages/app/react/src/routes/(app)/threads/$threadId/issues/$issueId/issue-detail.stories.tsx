import type { Meta, StoryObj } from '@storybook/react'
import { getIssueDetailQueryOptions, getNeedsYouPanelQueryOptions, getSessionChatQueryOptions } from '@codm/client-typescript/typescript'
import type {
	GetIssueDetailQueryResponse,
	GetNeedsYouPanelQueryResponse,
	GetSessionChatQueryResponse,
} from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { AppScreenFrame, connected, mockQuery } from '@/storybook'
import { SessionHeader } from '../../-components/SessionHeader'
import { IssueDetailSection } from '../../-components/IssueDetailSection'

const THREAD_ID = '019e4d24-6524-7041-9e1c-8108180cddae'
const ISSUE_ID = '019e4d24-6524-7041-9e1c-8108180cdd90'

/**
 * F3-waveA (A3) — slug `screen-01-detalhe-da-tarefa`.
 *
 * Content REPRODUCED from `design/fidelity/targets/screens/screen-01-detalhe-da-tarefa.png`: the
 * "DEMO SHOP BOT · Em execução" header, "Só responde quando mencionado com @aurora", the task key
 * `invoice-500` / title "Erro 500 ao gerar a fatura do cliente Acme", the "Precisa de entrada" chip,
 * the paused-alert banner ("Erro de servidor — 429 rate limit no provedor de faturas. O agente
 * parou e aguarda você." with "Tentar novamente" / "Assumir"), the terminal session lines, and the
 * "Oriente esta tarefa..." composer.
 */
const SESSION: DeepPartial<GetSessionChatQueryResponse> = {
	thread: {
		threadId: THREAD_ID,
		displayName: 'DEMO SHOP BOT',
		channelId: 'channel-1',
		externalId: '5511900000005',
		hasAvatar: false,
		channelKind: 'WHATSAPP',
		workspacePath: '/Users/work/Desktop/Projetos/aurora-labs',
		providers: ['CLAUDE_CODE'],
		status: 'RUNNING',
		lastActivity: new Date().toISOString(),
	},
	paused: false,
	mentionGate: { enabled: true, tag: '@aurora' },
}

const ISSUE_DETAIL: DeepPartial<GetIssueDetailQueryResponse> = {
	issue: {
		issueId: ISSUE_ID,
		key: 'invoice-500',
		title: 'Erro 500 ao gerar a fatura do cliente Acme',
		status: 'NEEDS_INPUT',
		archived: false,
	},
	provider: 'CLAUDE_CODE',
	terminalLog: [
		{ at: '2026-08-06T10:00:00.000Z', line: 'bun run invoices:retry --client acme' },
		{ at: '2026-08-06T10:00:01.000Z', line: 'POST /v1/invoices  429 Too Many Requests' },
		{ at: '2026-08-06T10:00:02.000Z', line: '  retry 1/3 in 2s …' },
		{ at: '2026-08-06T10:00:04.000Z', line: '  retry 2/3 in 4s …' },
		{ at: '2026-08-06T10:00:05.000Z', line: '! provedor exige janela de 60s entre lotes' },
		{ at: '2026-08-06T10:00:05.500Z', line: '  stopped · aguardando operador' },
	],
	routedMessages: [],
	stops: [],
}

const NEEDS_YOU: DeepPartial<GetNeedsYouPanelQueryResponse> = {
	stops: [
		{
			stopId: '019e4d24-6524-7041-9e1c-8108180cddc1',
			issueId: ISSUE_ID,
			issueKey: 'invoice-500',
			kind: 'SERVER_ERROR',
			title: 'Erro de servidor',
			detail: '429 rate limit no provedor de faturas. O agente parou e aguarda você.',
			raisedAt: '2026-08-06T10:00:05.500Z',
			availableResolutions: ['RETRY', 'TAKE_OVER'],
		},
	],
}

const meta = {
	title: 'Session/IssueDetailSection',
	component: IssueDetailSection,
	args: { threadId: THREAD_ID, issueId: ISSUE_ID },
	parameters: connected({
		route: { id: '/(app)/threads/$threadId/issues/$issueId/' },
		msw: {
			handlers: [
				mockQuery(getSessionChatQueryOptions(THREAD_ID), SESSION),
				mockQuery(getIssueDetailQueryOptions(ISSUE_ID), ISSUE_DETAIL),
				mockQuery(getNeedsYouPanelQueryOptions(THREAD_ID), NEEDS_YOU),
			],
		},
	}),
} satisfies Meta<typeof IssueDetailSection>
export default meta

type Story = StoryObj<typeof meta>

/**
 * Screen — 01 · Detalhe da tarefa (F3-waveA A3), measured against
 * `design/fidelity/targets/screens/screen-01-detalhe-da-tarefa.png` via `bun fidelity`.
 *
 * Renders the ROUTE'S REAL composition: the `$threadId` layout's `SessionHeader` (the masthead
 * every session tab shares — `routes/(app)/threads/$threadId/route.tsx` owns mounting it, not this
 * leaf route) followed by `IssueDetailSection` (what `issues/$issueId/index.tsx` mounts), inside
 * `AppScreenFrame` for the title bar + real `Sidebar`. The wrapper div's classes
 * (`mx-auto flex w-full flex-col px-6 gap-2 h-full`) are copied from `SessionLayout` in
 * `route.tsx` — that component isn't exported (routes are thin shells, not meant to be imported),
 * so the wrapper is reproduced here rather than composed.
 *
 * No portal/overlay gap here — unlike screens 02-04 in this same wave, `IssueDetailSection` is a
 * plain in-flow component.
 */
export const Full: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'screen-01-detalhe-da-tarefa', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: () => (
		<AppScreenFrame>
			<div className="mx-auto flex h-full w-full flex-col gap-2 px-6">
				<SessionHeader threadId={THREAD_ID} />
				<IssueDetailSection threadId={THREAD_ID} issueId={ISSUE_ID} />
			</div>
		</AppScreenFrame>
	),
}
