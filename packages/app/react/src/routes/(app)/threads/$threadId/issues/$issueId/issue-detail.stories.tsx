import type { Meta, StoryObj } from '@storybook/react'
import {
	getIssueDetailQueryOptions,
	getIssueTimelineQueryOptions,
	getNeedsYouPanelQueryOptions,
	getSessionChatQueryOptions,
	listArtifactsQueryOptions,
} from '@codm/client-typescript/typescript'
import type {
	GetIssueDetailQueryResponse,
	GetIssueTimelineQueryResponse,
	GetNeedsYouPanelQueryResponse,
	GetSessionChatQueryResponse,
	ListArtifactsQueryResponse,
} from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { AppScreenFrame, connected, mockQuery } from '@/storybook'
import { SessionHeader } from '../../-components/SessionHeader'
import { IssueDetailSection } from '../../-components/IssueDetailSection'

const THREAD_ID = '019e4d24-6524-7041-9e1c-8108180cddae'
const ISSUE_ID = '019e4d24-6524-7041-9e1c-8108180cdd90'
const STOP_ID = '019e4d24-6524-7041-9e1c-8108180cddc1'
const PREVIEW_ID = '019e4d24-6524-7041-9e1c-8108180cdda1'
const SHOT_ID = '019e4d24-6524-7041-9e1c-8108180cdda2'
const DIFF_ID = '019e4d24-6524-7041-9e1c-8108180cdda3'
const ASK_ENTRY = '019e4d24-6524-7041-9e1c-8108180cdde1'
const at = (minute: number) => `2026-11-24T10:${String(minute).padStart(2, '0')}:00.000Z`

/**
 * P1 — slug `screen-01-detalhe-da-tarefa` (unfrozen 24/11 — `.specs/2026-11-24-tarefa-e-painel-design.md`, decision 2).
 *
 * Content REPRODUCED from the PROPOSTA frame's "P1 · Tarefa por dentro" (`design/codm.pen`): task APP-12 "Botão
 * de cupom some no iPhone SE", needs-you; the conversation — Ana's message, a steer read by the agent, the
 * agent's answer, the preview link, the open decision D1 — the steer field; on the side three artifacts, the
 * session and the details. All names are the pen's fictitious ones.
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
	transcript: [
		{
			entryId: ASK_ENTRY,
			kind: 'CONTACT',
			text: 'o botão de cupom some no iPhone SE 🙁',
			at: at(2),
			issueId: ISSUE_ID,
			sender: { channelId: 'channel-1', externalId: '5511900000011', displayName: 'Ana Ribeiro', hasAvatar: false },
		},
	],
}

const ISSUE_DETAIL: DeepPartial<GetIssueDetailQueryResponse> = {
	issue: {
		issueId: ISSUE_ID,
		key: 'APP-12',
		title: 'Botão de cupom some no iPhone SE',
		status: 'NEEDS_INPUT',
		lifeState: 'WAITING_PERSON',
		paused: false,
		archived: false,
	},
	provider: 'CLAUDE_CODE',
	terminalLog: [
		{ at: at(20), line: 'bun run test:e2e --project=iphone-se' },
		{ at: at(25), line: '✓ 14 passed' },
		{ at: at(30), line: '✓ preview publicado · fix/cupom-se' },
	],
	routedMessages: [],
	stops: [],
	steers: [],
}

const TIMELINE: DeepPartial<GetIssueTimelineQueryResponse> = {
	items: [
		{ kind: 'CREATED', id: 't-created', at: at(2), title: 'Botão de cupom some no iPhone SE' },
		{
			kind: 'MESSAGE',
			id: 't-ask',
			at: at(2),
			entryId: ASK_ENTRY,
			transcriptKind: 'CONTACT',
			text: 'o botão de cupom some no iPhone SE 🙁',
		},
		{ kind: 'STEER', id: 't-steer', at: at(8), text: 'não mexe no checkout do desktop, só no mobile', readAt: at(9), reminder: false },
		{
			kind: 'MESSAGE',
			id: 't-agent',
			at: at(31),
			entryId: '019e4d24-6524-7041-9e1c-8108180cdde2',
			transcriptKind: 'SYSTEM',
			text: 'Prévia no ar. Testei no SE, no 15 e no desktop — o checkout do desktop não mudou.',
		},
		{
			kind: 'MESSAGE',
			id: 't-deliver',
			at: at(31),
			entryId: '019e4d24-6524-7041-9e1c-8108180cdde3',
			transcriptKind: 'SYSTEM',
			text: 'enviado ao grupo',
			artifactId: PREVIEW_ID,
		},
		{ kind: 'ARTIFACT', id: 't-preview', at: at(31), artifactId: PREVIEW_ID, artifactKind: 'LINK', name: 'Prévia — fix/cupom-se' },
		{
			kind: 'STOP_RAISED',
			id: 't-d1',
			at: at(32),
			stopId: STOP_ID,
			stopKind: 'DECISION_REQUESTED',
			title: 'Publicar o ajuste',
			ask: { code: 'APP-12 · D1', question: 'A prévia está pronta. Publico o ajuste do cupom agora ou espero o fim do dia?', options: [] },
		},
	],
}

const NEEDS_YOU: DeepPartial<GetNeedsYouPanelQueryResponse> = {
	stops: [
		{
			stopId: STOP_ID,
			issueId: ISSUE_ID,
			issueKey: 'APP-12',
			kind: 'DECISION_REQUESTED',
			title: 'Publicar o ajuste',
			detail: '',
			raisedAt: at(32),
			availableResolutions: [],
			ask: {
				kind: 'DECISION_REQUESTED',
				code: 'APP-12 · D1',
				question: 'A prévia está pronta. Publico o ajuste do cupom agora ou espero o fim do dia?',
				reply: {
					kind: 'OPTION',
					options: [
						{ id: 'now', label: 'Publicar agora' },
						{ id: 'eod', label: 'Esperar o fim do dia' },
					],
				},
				releaseRequired: true,
			},
		},
	],
}

const ARTIFACTS: DeepPartial<ListArtifactsQueryResponse> = {
	artifacts: [
		{
			artifactId: PREVIEW_ID,
			issueId: ISSUE_ID,
			kind: 'LINK',
			name: 'Prévia — fix/cupom-se',
			ref: 'https://fix-cupom-se.preview.local',
			meta: '',
			recordedAt: at(31),
		},
		{
			artifactId: SHOT_ID,
			issueId: ISSUE_ID,
			kind: 'FILE',
			name: 'cupom-iphone-se.png',
			ref: '/tmp/cupom-iphone-se.png',
			meta: '',
			recordedAt: at(28),
		},
		{
			artifactId: DIFF_ID,
			issueId: ISSUE_ID,
			kind: 'FILE',
			name: 'fix-cupom-se.diff',
			ref: '/tmp/fix-cupom-se.diff',
			meta: '',
			recordedAt: at(30),
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
				mockQuery(getIssueTimelineQueryOptions(ISSUE_ID), TIMELINE),
				mockQuery(getNeedsYouPanelQueryOptions(THREAD_ID), NEEDS_YOU),
				mockQuery(listArtifactsQueryOptions(THREAD_ID), ARTIFACTS),
			],
		},
	}),
} satisfies Meta<typeof IssueDetailSection>
export default meta

type Story = StoryObj<typeof meta>

/**
 * P1 · Tarefa por dentro, measured against `design/fidelity/targets/screens/screen-01-detalhe-da-tarefa.png`
 * (re-exported from the pen's P1 frame) via `bun fidelity`.
 *
 * Renders the ROUTE'S REAL composition: the `$threadId` layout's `SessionHeader` followed by
 * `IssueDetailSection` (what `issues/$issueId/index.tsx` mounts), inside `AppScreenFrame` for the title bar +
 * real `Sidebar`. The wrapper div's classes are copied from `SessionLayout` in `route.tsx` (not exported).
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
