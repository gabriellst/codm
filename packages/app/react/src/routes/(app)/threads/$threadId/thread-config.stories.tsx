import type { Meta, StoryObj } from '@storybook/react'
import {
	getNeedsYouPanelQueryOptions,
	getSessionChatQueryOptions,
	getThreadSettingsQueryOptions,
	listArtifactsQueryOptions,
	listThreadLoopsQueryOptions,
} from '@codm/client-typescript/typescript'
import type {
	GetNeedsYouPanelQueryResponse,
	GetSessionChatQueryResponse,
	GetThreadSettingsQueryResponse,
	ListThreadLoopsQueryResponse,
} from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { Dialog } from '@codm/app-ui/dialog'
import { AppScreenFrame, connected, mockQuery } from '@/storybook'
import { SessionHeader } from './-components/SessionHeader'
import { SessionChatSection } from './-components/SessionChatSection'
import { ThreadSettingsDialog } from './-components/ThreadSettingsDialog'

// SEPARATE FILE FROM `-components/ThreadSettingsDialog/index.stories.tsx` ON PURPOSE (route folder
// collides, the component doesn't): that file is the Conversa-area worker's SÓ-VISUAL story (no
// `parameters.fidelity`, its own mock roster). This one is F3-waveA (A3) — "Tarefa & Config da
// conversa" — and owns slugs `screen-02-configuracoes-da-conversa` / `screen-03-loops`.

const THREAD_ID = '019e4d24-6524-7041-9e1c-8108180cddae'

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/screen-02-configuracoes-da-conversa.png`
 * and `screen-03-loops.png` (both are the SAME dialog, the design's own two captures of it): thread
 * name "DEMO SHOP BOT", mention gate on with tag "@aurora", agents Claude Code + Codex bound / OpenCode
 * not, the custom prompt text, and the five participants (Operator, Thiago Barros, Demo Shop, Diego
 * Martins, Eduardo Lima — Eduardo is the one row with "Pode invocar" off).
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
	composerMode: 'DIRECT',
	activeStops: [],
	// The dimmed backdrop behind the modal (D3 — `bg-foreground/70`) is the Chat tab, same three rows
	// the "Apagar conversa" screen (screen-04, `delete-thread.stories.tsx`) shows more legibly — kept
	// identical across both story files rather than re-derived per screen.
	transcript: [
		{
			entryId: '019e4d24-6524-7041-9e1c-8108180cdd10',
			kind: 'CONTACT',
			text: '@aurora o deploy de ontem subiu com o rate limit novo?',
			at: '2026-08-06T09:12:00.000Z',
			sender: { channelId: 'channel-1', externalId: '5511900000003', displayName: 'Thiago Barros', hasAvatar: false },
		},
		{
			entryId: '019e4d24-6524-7041-9e1c-8108180cdd11',
			kind: 'DIRECT',
			text: 'Subiu. O provedor de faturas passou a exigir janela de 60s entre lotes — abri a tarefa invoice-500 e parei aguardando você.',
			at: '2026-08-06T09:12:30.000Z',
		},
		{
			entryId: '019e4d24-6524-7041-9e1c-8108180cdd12',
			kind: 'CONTACT',
			text: '@aurora assume a invoice-500',
			at: '2026-08-06T09:13:00.000Z',
			sender: { channelId: 'channel-1', externalId: '5511900000004', displayName: 'Diego Martins', hasAvatar: false },
		},
	],
}

const THREAD_SETTINGS: DeepPartial<GetThreadSettingsQueryResponse> = {
	mentionGate: { enabled: true, tag: '@aurora' },
	// DELIBERATE DIVERGENCE FROM THE TARGET PNG (founder, 2026-08-25): `screen-02-configuracoes-da-
	// conversa.png` predates the "Indicador de pensando", "Reações" and "Resposta em tempo real"
	// toggles — all three are new product surface added after that capture, not a fidelity
	// regression. The rows render (canon "o padrão vence o pixel" doesn't apply here — this isn't a
	// scale/pixel tradeoff, it's features the target simply doesn't have yet), so `bun fidelity`'s
	// score for this slug is expected to read slightly below target until the reference PNG is
	// recaptured.
	thinkingIndicator: { enabled: true },
	reactions: { enabled: true },
	streaming: { enabled: true },
	participants: [
		{
			participantId: 'operator',
			name: 'Operator',
			source: 'Operator on this machine',
			canInvoke: true,
			channelId: 'channel-1',
			hasAvatar: false,
		},
		{
			participantId: 'p-thiago',
			name: 'Thiago Barros',
			source: 'Channel group member',
			canInvoke: true,
			channelId: 'channel-1',
			hasAvatar: false,
		},
		{
			participantId: 'p-demobot',
			name: 'Demo Shop',
			source: 'Channel group member',
			canInvoke: true,
			channelId: 'channel-1',
			hasAvatar: false,
		},
		{
			participantId: 'p-diego',
			name: 'Diego Martins',
			source: 'Channel group member',
			canInvoke: true,
			channelId: 'channel-1',
			hasAvatar: false,
		},
		{
			participantId: 'p-eduardo',
			name: 'Eduardo Lima',
			source: 'Channel group member',
			canInvoke: false,
			channelId: 'channel-1',
			hasAvatar: false,
		},
	],
	invokerCount: 4,
	// GAP (débito que não é CSS, UI-FIDELITY.md "Quando o alvo pede um dado que o contrato não tem"):
	// the target reads "40 mensagens", but `BufferSize` is a closed enum (`25|50|100|200`) — 40 isn't a
	// member. Nearest valid value used; fabricating a `'40'` literal would fail `tsc` (and, if it
	// didn't, would misrepresent the wire). Correction path: either the design normalizes to a scale
	// member (UI-FIDELITY "o padrão vence o pixel", outcome 1) or the enum grows a step — a founder
	// call, not this task's.
	bufferSize: '50',
	customPrompt: 'Comece TODA mensagem com *AGENTE* na primeira linha. Nunca envie broadcast sem aprovação explícita da copy final.',
	customPromptMaxLength: 8000,
	providers: [
		{ provider: 'CLAUDE_CODE', comingSoon: false, model: 'DEFAULT', models: ['DEFAULT', 'OPUS', 'SONNET', 'HAIKU'] },
		{ provider: 'CODEX', comingSoon: false, model: 'DEFAULT', models: ['DEFAULT'] },
		{ provider: 'OPENCODE', comingSoon: true, model: 'DEFAULT', models: [] },
	],
}

const LOOPS: DeepPartial<ListThreadLoopsQueryResponse> = {
	loops: [
		{
			loopId: '019e4d24-6524-7041-9e1c-8108180cddb1',
			prompt: 'Pergunte ao time como está o deploy de hoje e resuma em três linhas.',
			schedule: {
				kind: 'DAILY',
				timeOfDay: '09:00',
				weekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
				timezone: 'America/Sao_Paulo',
			},
			enabled: true,
			nextRunAt: '2026-08-07T12:00:00.000Z',
			lastFiredAt: '2026-08-06T12:00:00.000Z',
		},
		{
			loopId: '019e4d24-6524-7041-9e1c-8108180cddb2',
			prompt: 'Verifique se alguma tarefa está parada há mais de duas horas.',
			schedule: { kind: 'INTERVAL', everyMinutes: 30 },
			enabled: true,
			nextRunAt: '2026-08-06T12:30:00.000Z',
			lastFiredAt: '2026-08-06T12:00:00.000Z',
		},
		{
			loopId: '019e4d24-6524-7041-9e1c-8108180cddb3',
			prompt: 'Resuma as decisões da semana para o cliente.',
			schedule: { kind: 'DAILY', timeOfDay: '17:00', weekdays: ['FRIDAY'], timezone: 'America/Sao_Paulo' },
			enabled: false,
		},
	],
	promptMaxLength: 2000,
	minIntervalMinutes: 1,
	maxIntervalMinutes: 1440,
}

const NEEDS_YOU: DeepPartial<GetNeedsYouPanelQueryResponse> = { stops: [] }

const meta = {
	title: 'Session/ThreadSettingsDialog (Fidelity)',
	component: ThreadSettingsDialog,
	args: { threadId: THREAD_ID },
	parameters: connected({
		route: { id: '/(app)/threads/$threadId/' },
		msw: {
			handlers: [
				mockQuery(getSessionChatQueryOptions(THREAD_ID), SESSION),
				mockQuery(getThreadSettingsQueryOptions(THREAD_ID), THREAD_SETTINGS),
				mockQuery(listThreadLoopsQueryOptions(THREAD_ID), LOOPS),
				mockQuery(getNeedsYouPanelQueryOptions(THREAD_ID), NEEDS_YOU),
				mockQuery(listArtifactsQueryOptions(THREAD_ID), { artifacts: [] }),
			],
		},
	}),
} satisfies Meta<typeof ThreadSettingsDialog>
export default meta

type Story = StoryObj<typeof meta>

/**
 * KNOWN GAP (F3-waveA A3, canon 11 — UI-FIDELITY.md "O padrão vence o pixel" / cânon 11): both
 * stories below render the REAL, LIVE `ThreadSettingsDialog` (`<Dialog open>` — the same pattern the
 * sibling `-components/ThreadSettingsDialog/index.stories.tsx` already uses) rather than a static
 * `XxxPanel` reproduction, because the dialog's SECTIONS (`TriggerSection`, `AgentsSection`,
 * `BufferSection`, `CustomPromptSection`, `ParticipantsSection`, `DangerZone`) are private to
 * `-components/ThreadSettingsDialog/index.tsx` — only `ThreadSettingsDialog` itself and
 * `LoopsSection` are exported — and that file is out of this task's exclusive scope (`*.stories.tsx`
 * only) and belongs to the Conversa-area worker.
 *
 * This means `bun fidelity`'s screenshot for `kind: 'screens'` (`page.locator('#storybook-root').
 * screenshot()`, `scripts/fidelity.ts`) WILL under-capture: `DialogContent` always wraps its children
 * in `DialogPortal` (Base UI `Dialog.Portal`, no `container` override anywhere in this codebase), so
 * the modal — and its `bg-foreground/70` backdrop — render as children of `document.body`, outside
 * `#storybook-root`. The root screenshot will show the dimmed `AppScreenFrame` background with the
 * dialog itself absent, scoring far below target for a reason that has nothing to do with visual
 * fidelity. This is a STRUCTURAL gap, not a CSS one — recorded here rather than silently accepted.
 *
 * PROPOSED TECHNIQUE (for the orchestrator / Conversa-area worker to action): extract the dialog's
 * body into an exported, presentational `ThreadSettingsPanel(props)` — the six sections above,
 * unwrapped from `DialogContent` — that `ThreadSettingsDialog` renders inside `DialogContent` for the
 * live app, and that a story can mount directly (no portal) for `bun fidelity` capture. Exactly the
 * `AppScreenFrame` precedent (`storybook/AppScreenFrame.tsx`'s own docblock): chrome the route doesn't
 * own gets reproduced outside it; content the route DOES own gets extracted so a story can compose it
 * without the interactive wrapper. Until that lands, these two stories are registered (satisfy G4 —
 * "toda tela tem story" — and are inspectable in Storybook itself) but their `bun fidelity` score is
 * not meaningful.
 */
export const ConfiguracoesDaConversa: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'screen-02-configuracoes-da-conversa', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: () => (
		<AppScreenFrame>
			<div className="mx-auto flex h-full w-full flex-col gap-2 px-6">
				<SessionHeader threadId={THREAD_ID} />
				<SessionChatSection threadId={THREAD_ID} />
			</div>
			<Dialog open>
				<ThreadSettingsDialog threadId={THREAD_ID} />
			</Dialog>
		</AppScreenFrame>
	),
}

/** Same dialog as `ConfiguracoesDaConversa` — the design's own second capture, scrolled to the
 *  Participantes/Loops/Zona de perigo section. See the docblock above for the shared gap. */
export const Loops: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'screen-03-loops', kind: 'screens', viewport: { width: 1440, height: 900 } },
	},
	render: () => (
		<AppScreenFrame>
			<div className="mx-auto flex h-full w-full flex-col gap-2 px-6">
				<SessionHeader threadId={THREAD_ID} />
				<SessionChatSection threadId={THREAD_ID} />
			</div>
			<Dialog open>
				<ThreadSettingsDialog threadId={THREAD_ID} />
			</Dialog>
		</AppScreenFrame>
	),
}
