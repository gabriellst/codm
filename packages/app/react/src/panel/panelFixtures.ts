import type {
	GetPanelBoardQueryResponse,
	GetPanelIdentityQueryResponse,
	GetPanelIssueQueryResponse,
	ListPanelMembersQueryResponse,
} from '@codm/client-typescript/typescript-cloud'

/**
 * The pen's fictitious group (Aurora Labs, Ana Ribeiro, APP-12…) as the cloud's panel endpoints would answer it —
 * shared by `PanelApp.test.tsx` and `PanelApp.stories.tsx`, typed by the SDK so a contract change breaks here
 * first. Never imported by the panel itself.
 */

export const PANEL_TOKEN = 'aurora-labs-demo-token'

export const ISSUE_APP12 = '0b7f1c2e-1a2b-4c3d-8e4f-000000000012'
export const STOP_D1 = '5d6e7f80-1a2b-4c3d-8e4f-0000000000d1'
const ISSUE_APP10 = '0b7f1c2e-1a2b-4c3d-8e4f-000000000010'
const ISSUE_APP17 = '0b7f1c2e-1a2b-4c3d-8e4f-000000000017'

/** A fixed morning, so times read like the pen (local time of whoever runs it). */
const at = (hhmm: string) => {
	const [h, m] = hhmm.split(':').map(Number)
	const date = new Date(2026, 10, 24, h ?? 0, m ?? 0)
	return date.toISOString()
}

type BoardIssue = GetPanelBoardQueryResponse['issues'][number]

const issue = (n: number, title: string, lifeState: BoardIssue['lifeState'], extra: Partial<BoardIssue> = {}): BoardIssue => ({
	issueId: `0b7f1c2e-1a2b-4c3d-8e4f-0000000000${String(n).padStart(2, '0')}`,
	key: `APP-${String(n).padStart(2, '0')}`,
	title,
	status: lifeState === 'DONE' ? 'COMPLETED' : lifeState === 'WAITING_PERSON' ? 'NEEDS_INPUT' : 'WORKING',
	lifeState,
	updatedAt: at('10:40'),
	openAsks: [],
	artifactCount: 0,
	...extra,
})

const DECISION_OPTIONS = [
	{ id: 'now', label: 'Publicar agora' },
	{ id: 'later', label: 'Esperar o fim do dia' },
]

export const PANEL_BOARD: GetPanelBoardQueryResponse = {
	group: { name: 'Aurora Labs' },
	daemonLastSeenAt: new Date().toISOString(),
	health: {
		state: 'OK',
		windowPercent: 34,
		weekPercent: 58,
		slots: { inUse: 3, effective: 4 },
		queuePending: 1,
		daemonSeenAt: new Date().toISOString(),
	},
	batches: [
		{
			code: 'L-31',
			status: 'INCOMPLETE',
			sourceEntryId: 'entry-l31',
			items: [
				{ n: 1, excerpt: 'ajustar o banner da Black Friday', destination: { kind: 'NEW_ISSUE', issueId: ISSUE_APP17 } },
				{ n: 2, excerpt: 'o botão de cupom some no iPhone SE', destination: { kind: 'ATTACHED', issueId: ISSUE_APP12 } },
				{ n: 3, excerpt: 'trocar a fonte do site inteiro', destination: { kind: 'DECLINED', reason: 'fora do escopo deste grupo' } },
				{ n: 4, excerpt: 'revisar o frete do Norte' },
			],
		},
	],
	issues: [
		issue(16, 'Traduzir e-mails de carrinho abandonado', 'QUEUED'),
		issue(17, 'Ajustar banner da Black Friday', 'QUEUED'),
		issue(14, 'Página de frete grátis acima de R$ 199', 'RUNNING', { artifactCount: 2 }),
		issue(13, 'Corrigir ordenação da busca', 'RUNNING', { artifactCount: 1 }),
		issue(18, 'Página de troca e devolução', 'RUNNING'),
		issue(12, 'Botão de cupom some no iPhone SE', 'WAITING_PERSON', {
			artifactCount: 4,
			openAsks: [
				{
					kind: 'DECISION_REQUESTED',
					code: 'D1',
					question: 'publico agora ou no fim do dia?',
					reply: { kind: 'OPTION', options: DECISION_OPTIONS },
					releaseRequired: true,
				},
			],
		}),
		issue(10, 'Migrar cupons antigos', 'WAITING_PERSON', {
			issueId: ISSUE_APP10,
			openAsks: [
				{
					kind: 'QUESTION_ASKED',
					code: 'P1',
					question: 'apago os cupons vencidos?',
					reply: {
						kind: 'OPTION',
						options: [
							{ id: 'yes', label: 'sim' },
							{ id: 'no', label: 'não' },
						],
					},
					defaultLabel: 'não',
					dueAt: at('11:15'),
				},
			],
		}),
		issue(15, 'Relatório semanal de vendas', 'WAITING_PROVIDER', { waitingForProviderUntil: at('14:00') }),
		issue(9, 'Revisar textos do app', 'WAITING_RETRY', { retryingAt: at('10:52') }),
		issue(11, 'Integração Pix — sandbox fora do ar', 'STALLED', { escalatedAt: at('10:20') }),
		issue(8, 'Export de pedidos em CSV', 'PAUSED'),
		issue(7, 'Favicon novo', 'DONE'),
		issue(6, 'Corrigir link do rodapé', 'DONE'),
	],
}

export const PANEL_ISSUE_APP12: GetPanelIssueQueryResponse = {
	issue: {
		issueId: ISSUE_APP12,
		key: 'APP-12',
		title: 'Botão de cupom some no iPhone SE',
		status: 'NEEDS_INPUT',
		lifeState: 'WAITING_PERSON',
		updatedAt: at('10:33'),
	},
	timeline: [
		{ kind: 'CREATED', id: 't1', at: at('10:02'), title: 'Botão de cupom some no iPhone SE' },
		{ kind: 'MESSAGE', id: 't2', at: at('10:02'), entryId: 'e1', transcriptKind: 'CONTACT', text: 'o botão de cupom some no iPhone SE 🙁' },
		{ kind: 'BATCH_LINKED', id: 't3', at: at('10:02'), batchCode: 'L-31', n: 2 },
		{ kind: 'ARTIFACT', id: 't4', at: at('10:03'), artifactId: 'a1', artifactKind: 'VIDEO', name: 'repro-se.mp4' },
		{
			kind: 'STEER',
			id: 't5',
			at: at('10:08'),
			text: 'não mexe no checkout do desktop, só no mobile',
			readAt: at('10:09'),
			reminder: false,
		},
		{ kind: 'ARTIFACT', id: 't6', at: at('10:28'), artifactId: 'a2', artifactKind: 'IMAGE', name: 'cupom-iphone-se.png' },
		{ kind: 'ARTIFACT', id: 't7', at: at('10:30'), artifactId: 'a3', artifactKind: 'FILE', name: 'fix-cupom-se.diff' },
		{
			kind: 'MESSAGE',
			id: 't8',
			at: at('10:31'),
			entryId: 'e2',
			transcriptKind: 'SYSTEM',
			text: 'Prévia no ar. Testei no SE, no 15 e no desktop.',
			routing: 'GROUP',
		},
		{ kind: 'ARTIFACT', id: 't9', at: at('10:31'), artifactId: 'a4', artifactKind: 'LINK', name: 'Prévia — fix/cupom-se' },
		{
			kind: 'STOP_RAISED',
			id: 't10',
			at: at('10:33'),
			stopId: STOP_D1,
			stopKind: 'DECISION_REQUESTED',
			title: 'Publicar o ajuste',
			ask: {
				code: 'D1',
				question: 'A prévia está pronta. Publico o ajuste do cupom agora ou espero o fim do dia?',
				options: DECISION_OPTIONS,
			},
		},
	],
	openStops: [
		{
			stopId: STOP_D1,
			kind: 'DECISION_REQUESTED',
			resolutions: [],
			ask: {
				kind: 'DECISION_REQUESTED',
				code: 'D1',
				question: 'A prévia está pronta. Publico o ajuste do cupom agora ou espero o fim do dia?',
				reply: { kind: 'OPTION', options: DECISION_OPTIONS },
				releaseRequired: true,
			},
		},
	],
}

export const PANEL_MEMBERS: ListPanelMembersQueryResponse = {
	members: [
		{ memberId: 'member-ana', name: 'Ana Ribeiro' },
		{ memberId: 'member-bruno', name: 'Bruno Lima' },
		{ memberId: 'member-carla', name: 'Carla Souza' },
	],
}

export const PANEL_ME_RELEASER: GetPanelIdentityQueryResponse = {
	member: { memberId: 'member-ana', name: 'Ana Ribeiro', canRelease: true },
}

export const PANEL_ME_MEMBER: GetPanelIdentityQueryResponse = {
	member: { memberId: 'member-bruno', name: 'Bruno Lima', canRelease: false },
}

export const PANEL_ME_NOBODY: GetPanelIdentityQueryResponse = {}
